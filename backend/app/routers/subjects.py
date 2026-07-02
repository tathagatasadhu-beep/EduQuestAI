"""Subjects/topics router — STUB. Mostly read-only, global library."""
from fastapi import APIRouter

router = APIRouter()


@router.get("")
def list_subjects():
    ...


@router.get("/{subject_id}/topics")
def list_topics(subject_id: str):
    ...
