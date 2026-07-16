"""
PDF upload/ingestion router — real implementation.

Upload stores the file in a private, parent-scoped path in Supabase Storage,
inserts a `pdfs` row (status='pending'), and kicks off a background task that
runs the OCR + LLM extraction pipeline (ai-engine/pipeline.py) and writes the
resulting questions/answer_keys, updating `pdfs.status` along the way.

Deletion is soft: the `pdfs` row gets `deleted_at` set and its extracted
questions get `is_active=False` instead of being hard-deleted. Questions
cascade-delete `attempts`/`review_queue` rows, and hard-deleting would wipe a
student's practice history for something they already answered — soft
deactivation removes the questions from future serving (see
quiz.py::next_question) while leaving history/mastery intact.
"""
import asyncio
import sys
import uuid
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Form, HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.supabase_client import QUESTION_IMAGES_BUCKET, WORKSHEETS_BUCKET, get_supabase_admin
from app.db.orm import AnswerKey, Pdf, Question, StudentAssignment, Subject, Topic
from app.db.session import SessionLocal, get_db
from app.models.schemas import PdfOut, PdfTopicOut, PdfUpdate, PdfUploadOut, TheoryPdfOut
from app.routers.auth import get_current_parent_id, get_current_student

# ai-engine/ is a sibling of backend/ with a hyphen in its name, so it can't be
# imported as a package (`ai-engine.pipeline` isn't valid Python). Add its
# directory to sys.path instead and import the module by its own name.
_AI_ENGINE_DIR = Path(__file__).resolve().parents[3] / "ai-engine"
if str(_AI_ENGINE_DIR) not in sys.path:
    sys.path.insert(0, str(_AI_ENGINE_DIR))
import pipeline as ingestion_pipeline  # noqa: E402

router = APIRouter()

BUCKET = WORKSHEETS_BUCKET
_bucket_ready = False
_image_bucket_ready = False


def _ensure_bucket() -> None:
    global _bucket_ready
    if _bucket_ready:
        return
    admin = get_supabase_admin()
    existing = {b.id for b in admin.storage.list_buckets()}
    if BUCKET not in existing:
        admin.storage.create_bucket(
            BUCKET, options={"public": False, "allowed_mime_types": ["application/pdf"]}
        )
    _bucket_ready = True


def _ensure_image_bucket() -> None:
    """A separate bucket from `worksheets` for cropped question-diagram
    images, rather than loosening the PDF bucket's mime-type allowlist."""
    global _image_bucket_ready
    if _image_bucket_ready:
        return
    admin = get_supabase_admin()
    existing = {b.id for b in admin.storage.list_buckets()}
    if QUESTION_IMAGES_BUCKET not in existing:
        admin.storage.create_bucket(
            QUESTION_IMAGES_BUCKET, options={"public": False, "allowed_mime_types": ["image/jpeg", "image/png"]}
        )
    _image_bucket_ready = True


def _upload_out(pdf: Pdf) -> PdfUploadOut:
    return PdfUploadOut(
        id=pdf.id, status=pdf.status, original_name=pdf.original_name,
        content_type=pdf.content_type, error_message=pdf.error_message,
    )


@router.post("/upload", response_model=PdfUploadOut)
async def upload_pdf(
    background_tasks: BackgroundTasks,
    file: UploadFile,
    subject_id: UUID | None = Form(None),
    topic_id: UUID | None = Form(None),
    content_type: str = Form("practice"),
    db: AsyncSession = Depends(get_db),
    parent_id: UUID = Depends(get_current_parent_id),
):
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")
    if content_type not in ("theory", "practice"):
        raise HTTPException(status_code=400, detail="content_type must be 'theory' or 'practice'.")
    if topic_id is not None:
        topic = await db.get(Topic, topic_id)
        if topic is None or (subject_id is not None and topic.subject_id != subject_id):
            raise HTTPException(status_code=400, detail="Topic not found in the selected subject.")

    pdf_bytes = await file.read()
    storage_path = f"{parent_id}/{uuid.uuid4()}_{file.filename}"

    await asyncio.to_thread(_ensure_bucket)
    admin = get_supabase_admin()
    await asyncio.to_thread(
        admin.storage.from_(BUCKET).upload,
        storage_path,
        pdf_bytes,
        {"content-type": "application/pdf"},
    )

    pdf = Pdf(
        uploaded_by=parent_id,
        subject_id=subject_id,
        storage_path=storage_path,
        original_name=file.filename,
        status="pending",
        content_type=content_type,
    )
    db.add(pdf)
    await db.commit()
    await db.refresh(pdf)

    background_tasks.add_task(_process_pdf, pdf.id, subject_id, topic_id, pdf_bytes, file.filename)

    return _upload_out(pdf)


async def _topics_by_pdf(db: AsyncSession, pdf_ids: list[UUID]) -> dict[UUID, list[PdfTopicOut]]:
    """A worksheet's questions can span more than one topic — used to show
    each PDF's topic(s) in the library table without a separate topic-per-PDF
    concept existing in the schema."""
    if not pdf_ids:
        return {}
    rows = (
        await db.execute(
            select(Question.pdf_id, Topic.id, Topic.name)
            .join(Topic, Topic.id == Question.topic_id)
            .where(Question.pdf_id.in_(pdf_ids))
            .distinct()
        )
    ).all()
    by_pdf: dict[UUID, list[PdfTopicOut]] = {}
    for pdf_id, topic_id, topic_name in rows:
        by_pdf.setdefault(pdf_id, []).append(PdfTopicOut(id=topic_id, name=topic_name))
    return by_pdf


async def _merge_manual_topics(db: AsyncSession, pdfs: list[Pdf], topics_by_pdf: dict[UUID, list[PdfTopicOut]]) -> None:
    """Adds each PDF's manually-tagged `topic_id` (if set) into its topics
    list when it isn't already there via extracted questions — the only way
    a theory PDF (which always has zero extracted questions) ever shows a
    topic. Mutates `topics_by_pdf` in place."""
    manual_ids = {pdf.topic_id for pdf in pdfs if pdf.topic_id is not None}
    if not manual_ids:
        return
    topic_rows = (await db.execute(select(Topic).where(Topic.id.in_(manual_ids)))).scalars().all()
    topics_by_id = {t.id: t for t in topic_rows}
    for pdf in pdfs:
        if pdf.topic_id is None or pdf.topic_id not in topics_by_id:
            continue
        existing = topics_by_pdf.setdefault(pdf.id, [])
        if not any(t.id == pdf.topic_id for t in existing):
            existing.append(PdfTopicOut(id=pdf.topic_id, name=topics_by_id[pdf.topic_id].name))


@router.get("", response_model=list[PdfOut])
async def list_pdfs(
    db: AsyncSession = Depends(get_db),
    parent_id: UUID = Depends(get_current_parent_id),
):
    rows = (
        await db.execute(
            select(Pdf, Subject.name, func.count(Question.id))
            .outerjoin(Subject, Subject.id == Pdf.subject_id)
            .outerjoin(Question, Question.pdf_id == Pdf.id)
            .where(Pdf.uploaded_by == parent_id, Pdf.deleted_at.is_(None))
            .group_by(Pdf.id, Subject.name)
            .order_by(Pdf.uploaded_at.desc())
        )
    ).all()
    pdfs_only = [pdf for pdf, _, _ in rows]
    topics_by_pdf = await _topics_by_pdf(db, [pdf.id for pdf in pdfs_only])
    await _merge_manual_topics(db, pdfs_only, topics_by_pdf)
    return [
        PdfOut(
            id=pdf.id, original_name=pdf.original_name, status=pdf.status,
            error_message=pdf.error_message, content_type=pdf.content_type,
            subject_id=pdf.subject_id, subject_name=subject_name,
            question_count=question_count, uploaded_at=pdf.uploaded_at,
            topics=topics_by_pdf.get(pdf.id, []),
        )
        for pdf, subject_name, question_count in rows
    ]


@router.get("/theory", response_model=list[TheoryPdfOut])
async def list_theory_pdfs_for_student(
    subject_id: UUID,
    db: AsyncSession = Depends(get_db),
    student: dict = Depends(get_current_student),
):
    """Reference materials — theory worksheets for a subject the student has
    been assigned (any assignment row for the subject, whole-subject or a
    specific topic, grants access to that subject's theory PDFs). Signed
    URLs are generated fresh on each call since the storage bucket is
    private and the URL only needs to last long enough for the student to
    click it, not to be cached."""
    student_id = student["student_id"]
    assigned = (
        await db.execute(
            select(StudentAssignment.id)
            .where(StudentAssignment.student_id == student_id, StudentAssignment.subject_id == subject_id)
            .limit(1)
        )
    ).scalar_one_or_none()
    if assigned is None:
        raise HTTPException(status_code=403, detail="This subject isn't assigned to you.")

    pdfs = (
        await db.execute(
            select(Pdf)
            .where(Pdf.subject_id == subject_id, Pdf.content_type == "theory", Pdf.deleted_at.is_(None))
            .order_by(Pdf.uploaded_at.desc())
        )
    ).scalars().all()

    admin = get_supabase_admin()
    results = []
    for pdf in pdfs:
        try:
            signed = await asyncio.to_thread(admin.storage.from_(BUCKET).create_signed_url, pdf.storage_path, 600)
        except Exception:
            continue  # storage object missing/unreachable — skip rather than fail the whole list
        results.append(TheoryPdfOut(id=pdf.id, original_name=pdf.original_name, uploaded_at=pdf.uploaded_at, url=signed["signedURL"]))
    return results


async def _get_owned_pdf_or_404(db: AsyncSession, pdf_id: UUID, parent_id: UUID) -> Pdf:
    pdf = (
        await db.execute(
            select(Pdf).where(Pdf.id == pdf_id, Pdf.uploaded_by == parent_id, Pdf.deleted_at.is_(None))
        )
    ).scalar_one_or_none()
    if pdf is None:
        raise HTTPException(status_code=404, detail="PDF not found.")
    return pdf


@router.patch("/{pdf_id}", response_model=PdfOut)
async def update_pdf(
    pdf_id: UUID,
    payload: PdfUpdate,
    db: AsyncSession = Depends(get_db),
    parent_id: UUID = Depends(get_current_parent_id),
):
    pdf = await _get_owned_pdf_or_404(db, pdf_id, parent_id)
    pdf.content_type = payload.content_type
    if payload.topic_id is not None:
        topic = await db.get(Topic, payload.topic_id)
        if topic is None or (pdf.subject_id is not None and topic.subject_id != pdf.subject_id):
            raise HTTPException(status_code=400, detail="Topic not found in this worksheet's subject.")
        pdf.topic_id = payload.topic_id
    await db.commit()
    await db.refresh(pdf)

    subject_name = None
    if pdf.subject_id is not None:
        subject = await db.get(Subject, pdf.subject_id)
        subject_name = subject.name if subject else None
    question_count = (
        await db.execute(select(func.count(Question.id)).where(Question.pdf_id == pdf.id))
    ).scalar_one()
    topics_by_pdf = await _topics_by_pdf(db, [pdf.id])
    await _merge_manual_topics(db, [pdf], topics_by_pdf)
    topics = topics_by_pdf.get(pdf.id, [])
    return PdfOut(
        id=pdf.id, original_name=pdf.original_name, status=pdf.status,
        error_message=pdf.error_message, content_type=pdf.content_type,
        subject_id=pdf.subject_id, subject_name=subject_name,
        question_count=question_count, uploaded_at=pdf.uploaded_at,
        topics=topics,
    )


@router.delete("/{pdf_id}", status_code=204)
async def delete_pdf(
    pdf_id: UUID,
    db: AsyncSession = Depends(get_db),
    parent_id: UUID = Depends(get_current_parent_id),
):
    pdf = await _get_owned_pdf_or_404(db, pdf_id, parent_id)

    from datetime import datetime, timezone

    pdf.deleted_at = datetime.now(timezone.utc)
    await db.execute(
        Question.__table__.update().where(Question.pdf_id == pdf.id).values(is_active=False)
    )
    await db.commit()

    admin = get_supabase_admin()
    try:
        await asyncio.to_thread(admin.storage.from_(BUCKET).remove, [pdf.storage_path])
    except Exception:
        pass  # storage object may already be gone — the DB soft-delete is the source of truth


@router.get("/{pdf_id}/status", response_model=PdfUploadOut)
async def pdf_status(
    pdf_id: UUID,
    db: AsyncSession = Depends(get_db),
    parent_id: UUID = Depends(get_current_parent_id),
):
    pdf = (
        await db.execute(select(Pdf).where(Pdf.id == pdf_id, Pdf.uploaded_by == parent_id))
    ).scalar_one_or_none()
    if pdf is None:
        raise HTTPException(status_code=404, detail="PDF not found.")
    return _upload_out(pdf)


async def _process_pdf(
    pdf_id: UUID, subject_id: UUID | None, topic_id: UUID | None, pdf_bytes: bytes, filename: str
) -> None:
    """Runs after the response is sent, so it opens its own DB session —
    the request's session is long gone by the time this executes.

    subject_id is None when the parent didn't pick one at upload time — in
    that case the pipeline's own subject_guess resolves-or-creates one here,
    the same dedup-by-name pattern used below when topic_id also isn't given.

    topic_id, when the parent picks one at upload time, assigns every
    extracted question to that single topic instead of the AI's per-question
    topic_guess — the guess runs one LLM call per worksheet with no visibility
    into topics already in the library, so left alone it tends to invent a
    new near-duplicate topic per question instead of grouping them. A
    parent-chosen topic sidesteps that entirely."""
    async with SessionLocal() as db:
        pdf = await db.get(Pdf, pdf_id)
        pdf.status = "processing"
        await db.commit()

        try:
            result = await asyncio.to_thread(ingestion_pipeline.run_pipeline, pdf_bytes, filename)

            resolved_subject_id = subject_id
            if resolved_subject_id is None:
                subject_name = result.subject_guess.strip()
                subject = (
                    await db.execute(select(Subject).where(func.lower(Subject.name) == subject_name.lower()))
                ).scalar_one_or_none()
                if subject is None:
                    subject = Subject(name=subject_name)
                    db.add(subject)
                    await db.flush()
                resolved_subject_id = subject.id
                pdf.subject_id = resolved_subject_id

            fixed_topic = await db.get(Topic, topic_id) if topic_id is not None else None

            async def _store_question_image(image_url: str) -> str | None:
                """Re-uploads an already-downloaded diagram to permanent
                storage and returns its storage path, or None if there's
                nothing to store / the upload fails (non-fatal — the
                question is still usable without its diagram)."""
                image_bytes = result.images.get(image_url)
                if image_bytes is None:
                    return None
                await asyncio.to_thread(_ensure_image_bucket)
                admin = get_supabase_admin()
                # Mathpix cropped-image URLs sometimes carry a query string
                # (e.g. "?height=200&width=300") — strip it before checking
                # the extension so it isn't mistaken for part of the path.
                url_path = image_url.split("?", 1)[0].lower()
                ext = "png" if url_path.endswith(".png") else "jpg"
                content_type = "image/png" if ext == "png" else "image/jpeg"
                image_storage_path = f"{pdf.uploaded_by}/{pdf_id}/{uuid.uuid4()}.{ext}"
                try:
                    await asyncio.to_thread(
                        admin.storage.from_(QUESTION_IMAGES_BUCKET).upload,
                        image_storage_path,
                        image_bytes,
                        {"content-type": content_type},
                    )
                    return image_storage_path
                except Exception:
                    return None

            for eq in result.questions:
                if fixed_topic is not None:
                    topic = fixed_topic
                else:
                    topic = (
                        await db.execute(
                            select(Topic).where(
                                Topic.subject_id == resolved_subject_id,
                                func.lower(Topic.name) == eq.topic_guess.strip().lower(),
                            )
                        )
                    ).scalar_one_or_none()
                    if topic is None:
                        topic = Topic(subject_id=resolved_subject_id, name=eq.topic_guess.strip())
                        db.add(topic)
                        await db.flush()

                image_path = await _store_question_image(eq.image_url) if eq.image_url else None

                question = Question(
                    pdf_id=pdf_id,
                    topic_id=topic.id,
                    prompt_text=eq.prompt_text,
                    prompt_latex=eq.prompt_latex,
                    difficulty=eq.difficulty_guess,
                    question_type="multiple_choice" if len(eq.options) > 1 else "free_response",
                    image_path=image_path,
                    requires_self_assessment=eq.requires_self_assessment,
                )
                db.add(question)
                await db.flush()

                for opt in eq.options:
                    db.add(
                        AnswerKey(
                            question_id=question.id,
                            option_label=opt.get("label"),
                            option_text=opt["text"],
                            is_correct=opt.get("is_correct", False),
                        )
                    )

            pdf.status = "extracted"
            pdf.ocr_text = result.ocr_text
            await db.commit()
        except Exception as exc:
            await db.rollback()
            pdf = await db.get(Pdf, pdf_id)
            pdf.status = "failed"
            pdf.error_message = str(exc)[:500]
            await db.commit()
