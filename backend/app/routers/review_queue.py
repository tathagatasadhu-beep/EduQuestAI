"""Review queue router — STUB. Surfaces due retries for a student."""
from fastapi import APIRouter

router = APIRouter()


@router.get("/{student_id}")
def get_review_queue(student_id: str):
    ...
