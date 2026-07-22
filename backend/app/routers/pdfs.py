"""
PDF upload/ingestion router — real implementation.

Upload is a two-step, direct-to-storage flow (`create_upload_url` then
`process_uploaded_pdf`): the browser PUTs the file straight to Supabase
Storage using a signed URL instead of sending it through this backend, so a
large worksheet/answer-key PDF never has to pass through Vercel's
serverless-function request-body limit (4.5MB, non-configurable). Once
storage confirms the direct upload, a background task downloads the file
back from Storage, runs the OCR + LLM extraction pipeline
(ai-engine/pipeline.py), and writes the resulting questions/answer_keys,
updating `pdfs.status` along the way.

Deletion is soft: the `pdfs` row gets `deleted_at` set and its extracted
questions get `is_active=False` instead of being hard-deleted. Questions
cascade-delete `attempts`/`review_queue` rows, and hard-deleting would wipe a
student's practice history for something they already answered — soft
deactivation removes the questions from future serving (see
quiz.py::next_question) while leaving history/mastery intact.
"""
import asyncio
import re
import sys
import uuid
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.supabase_client import QUESTION_IMAGES_BUCKET, WORKSHEETS_BUCKET, get_supabase_admin
from app.db.orm import AnswerKey, Pdf, Question, StudentAssignment, Subject, Topic
from app.db.session import SessionLocal, get_db
from app.models.schemas import (
    PdfOut,
    PdfTopicOut,
    PdfUpdate,
    PdfUploadOut,
    PdfUploadUrlOut,
    PdfUploadUrlRequest,
    TheoryPdfOut,
)
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


_UNSAFE_KEY_CHARS = re.compile(r"[^A-Za-z0-9._-]")


def _safe_storage_filename(filename: str) -> str:
    """Supabase Storage object keys reject spaces and some other characters
    (confirmed live: a real filename with spaces got a 400 `InvalidKey` on
    the direct-upload PUT, even though the signed URL itself was valid) — a
    parent's original filename is never sanitized before this, so replace
    anything that isn't alphanumeric/dot/underscore/hyphen. `Pdf.original_name`
    stores the untouched original for display; only the storage key changes."""
    return _UNSAFE_KEY_CHARS.sub("_", filename)


@router.post("/upload-url", response_model=PdfUploadUrlOut)
async def create_upload_url(
    payload: PdfUploadUrlRequest,
    db: AsyncSession = Depends(get_db),
    parent_id: UUID = Depends(get_current_parent_id),
):
    """Step 1 of 2 for a worksheet upload — the browser then PUTs the file
    bytes directly to `upload_url` (Supabase Storage), bypassing this
    backend and, more importantly, Vercel's 4.5MB serverless-function
    request-body limit that a large worksheet/answer-key PDF can exceed.
    Once that direct upload finishes, the browser calls `POST
    /{pdf_id}/process` to kick off extraction (see below). The bucket's own
    `allowed_mime_types: ["application/pdf"]` (see `_ensure_bucket`) enforces
    the PDF-only rule at the storage layer, since this backend never sees
    the file's actual content-type in this flow."""
    if payload.content_type not in ("theory", "practice"):
        raise HTTPException(status_code=400, detail="content_type must be 'theory' or 'practice'.")
    if payload.topic_id is not None:
        topic = await db.get(Topic, payload.topic_id)
        if topic is None or (payload.subject_id is not None and topic.subject_id != payload.subject_id):
            raise HTTPException(status_code=400, detail="Topic not found in the selected subject.")

    storage_path = f"{parent_id}/{uuid.uuid4()}_{_safe_storage_filename(payload.filename)}"
    await asyncio.to_thread(_ensure_bucket)
    admin = get_supabase_admin()
    signed = await asyncio.to_thread(admin.storage.from_(BUCKET).create_signed_upload_url, storage_path)

    pdf = Pdf(
        uploaded_by=parent_id,
        subject_id=payload.subject_id,
        topic_id=payload.topic_id,
        storage_path=storage_path,
        original_name=payload.filename,
        status="pending",
        content_type=payload.content_type,
    )
    db.add(pdf)
    await db.commit()
    await db.refresh(pdf)

    return PdfUploadUrlOut(pdf_id=pdf.id, upload_url=signed["signed_url"])


@router.post("/{pdf_id}/process", response_model=PdfUploadOut)
async def process_uploaded_pdf(
    pdf_id: UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    parent_id: UUID = Depends(get_current_parent_id),
):
    """Step 2 of 2 — called once the browser's direct-to-Storage upload
    (from `create_upload_url` above) has finished, so the background OCR +
    extraction pipeline has something to actually read."""
    pdf = await _get_owned_pdf_or_404(db, pdf_id, parent_id)
    background_tasks.add_task(_process_pdf, pdf.id)
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
    subject_id: UUID | None = None,
    topic_id: UUID | None = None,
    db: AsyncSession = Depends(get_db),
    student: dict = Depends(get_current_student),
):
    """Reference materials — theory worksheets for a subject the student has
    been assigned (any assignment row for the subject, whole-subject or a
    specific topic, grants access to that subject's theory PDFs). Signed
    URLs are generated fresh on each call since the storage bucket is
    private and the URL only needs to last long enough for the student to
    click it, not to be cached.

    Exactly one of subject_id/topic_id must be given. subject_id (used on
    the subject-overview page) returns every theory PDF for the subject.
    topic_id (used on the practice-screen reference pane) narrows that down
    to PDFs a parent has explicitly tagged to that one topic via
    `pdfs.topic_id` — so a topic with no tagged theory PDF simply shows
    nothing, even if the subject has other theory material."""
    if (subject_id is None) == (topic_id is None):
        raise HTTPException(status_code=400, detail="Provide exactly one of subject_id or topic_id.")

    if topic_id is not None:
        topic = await db.get(Topic, topic_id)
        if topic is None:
            raise HTTPException(status_code=404, detail="Topic not found.")
        subject_id = topic.subject_id

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

    pdf_stmt = select(Pdf).where(Pdf.content_type == "theory", Pdf.deleted_at.is_(None))
    pdf_stmt = pdf_stmt.where(Pdf.topic_id == topic_id) if topic_id is not None else pdf_stmt.where(Pdf.subject_id == subject_id)
    pdfs = (await db.execute(pdf_stmt.order_by(Pdf.uploaded_at.desc()))).scalars().all()

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


async def _process_pdf(pdf_id: UUID) -> None:
    """Runs after the response is sent, so it opens its own DB session —
    the request's session is long gone by the time this executes. The file
    itself was uploaded directly to Storage by the browser (see
    `create_upload_url`/`process_uploaded_pdf` above), not passed through
    this backend, so the first thing this does is download it back.

    pdf.subject_id is None when the parent didn't pick one at upload time —
    in that case the pipeline's own subject_guess resolves-or-creates one
    here, the same dedup-by-name pattern used below when pdf.topic_id also
    isn't set.

    pdf.topic_id, when the parent picks one at upload time, assigns every
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
            admin = get_supabase_admin()
            pdf_bytes = await asyncio.to_thread(admin.storage.from_(BUCKET).download, pdf.storage_path)
            result = await asyncio.to_thread(ingestion_pipeline.run_pipeline, pdf_bytes, pdf.original_name)

            topic_id = pdf.topic_id
            resolved_subject_id = pdf.subject_id
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

            # Topics accumulate questions across multiple uploads (matched/reused
            # by name, or a parent-picked fixed topic) — sort_order has to keep
            # counting up from whatever's already in that topic, not restart at 0
            # for every upload, or two worksheets sharing a topic end up with
            # colliding sort_order values whose combined order interleaves them
            # (looks like random shuffling even though each worksheet's own
            # questions are individually in order).
            next_sort_order: dict[uuid.UUID, int] = {}

            async def _next_sort_order(topic_id: uuid.UUID) -> int:
                if topic_id not in next_sort_order:
                    existing_max = (
                        await db.execute(
                            select(func.max(Question.sort_order)).where(Question.topic_id == topic_id)
                        )
                    ).scalar_one()
                    next_sort_order[topic_id] = (existing_max + 1) if existing_max is not None else 0
                order = next_sort_order[topic_id]
                next_sort_order[topic_id] += 1
                return order

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
                    sort_order=await _next_sort_order(topic.id),
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
