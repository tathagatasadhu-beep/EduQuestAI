"""
PDF upload/ingestion router — real implementation.

Upload stores the file in a private, parent-scoped path in Supabase Storage,
inserts a `pdfs` row (status='pending'), and kicks off a background task that
runs the OCR + LLM extraction pipeline (ai-engine/pipeline.py) and writes the
resulting questions/answer_keys, updating `pdfs.status` along the way.
"""
import asyncio
import sys
import uuid
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Form, HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.supabase_client import get_supabase_admin
from app.db.orm import AnswerKey, Pdf, Question, Subject, Topic
from app.db.session import SessionLocal, get_db
from app.models.schemas import PdfUploadOut
from app.routers.auth import get_current_parent_id

# ai-engine/ is a sibling of backend/ with a hyphen in its name, so it can't be
# imported as a package (`ai-engine.pipeline` isn't valid Python). Add its
# directory to sys.path instead and import the module by its own name.
_AI_ENGINE_DIR = Path(__file__).resolve().parents[3] / "ai-engine"
if str(_AI_ENGINE_DIR) not in sys.path:
    sys.path.insert(0, str(_AI_ENGINE_DIR))
import pipeline as ingestion_pipeline  # noqa: E402

router = APIRouter()

BUCKET = "worksheets"
_bucket_ready = False


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


@router.post("/upload", response_model=PdfUploadOut)
async def upload_pdf(
    background_tasks: BackgroundTasks,
    file: UploadFile,
    subject_id: UUID | None = Form(None),
    db: AsyncSession = Depends(get_db),
    parent_id: UUID = Depends(get_current_parent_id),
):
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

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
    )
    db.add(pdf)
    await db.commit()
    await db.refresh(pdf)

    background_tasks.add_task(_process_pdf, pdf.id, subject_id, pdf_bytes, file.filename)

    return PdfUploadOut(id=pdf.id, status=pdf.status, original_name=pdf.original_name)


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
    return PdfUploadOut(id=pdf.id, status=pdf.status, original_name=pdf.original_name)


async def _process_pdf(pdf_id: UUID, subject_id: UUID | None, pdf_bytes: bytes, filename: str) -> None:
    """Runs after the response is sent, so it opens its own DB session —
    the request's session is long gone by the time this executes.

    subject_id is None when the parent didn't pick one at upload time — in
    that case the pipeline's own subject_guess resolves-or-creates one here,
    the same dedup-by-name pattern already used for topics below."""
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

            for eq in result.questions:
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

                question = Question(
                    pdf_id=pdf_id,
                    topic_id=topic.id,
                    prompt_text=eq.prompt_text,
                    prompt_latex=eq.prompt_latex,
                    difficulty=eq.difficulty_guess,
                    question_type="multiple_choice" if len(eq.options) > 1 else "free_response",
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
            await db.commit()
        except Exception:
            await db.rollback()
            pdf = await db.get(Pdf, pdf_id)
            pdf.status = "failed"
            await db.commit()
