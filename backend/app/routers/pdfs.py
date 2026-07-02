"""
PDF upload/ingestion router — STUB.
TODO: accept multipart upload, store in a private per-parent bucket (Supabase
Storage), insert a `pdfs` row with status='pending', then enqueue a background
job that calls ai-engine/pipeline.py.
"""
from fastapi import APIRouter, UploadFile
from app.models.schemas import PdfUploadOut

router = APIRouter()


@router.post("/upload", response_model=PdfUploadOut)
async def upload_pdf(file: UploadFile):
    ...


@router.get("/{pdf_id}/status")
def pdf_status(pdf_id: str):
    ...
