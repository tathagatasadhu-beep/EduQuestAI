"""Subjects/topics router — real implementation. Mostly read-only, global
library (not scoped by parent — every family shares the same subject/topic
catalog); creation just requires being logged in as some parent, since
there's no seed data or admin UI and a parent has to be able to add
"AP Calculus"/"SAT Math"/etc. before they can upload a worksheet into it."""
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.orm import Subject, Topic as TopicOrm
from app.db.session import get_db
from app.models.schemas import SubjectCreate, SubjectOut, Topic
from app.routers.auth import get_current_parent_id

router = APIRouter()


@router.get("", response_model=list[SubjectOut])
async def list_subjects(db: AsyncSession = Depends(get_db)):
    subjects = (await db.execute(select(Subject).order_by(Subject.name))).scalars().all()
    return [SubjectOut(id=s.id, name=s.name, description=s.description) for s in subjects]


@router.post("", response_model=SubjectOut)
async def create_subject(
    payload: SubjectCreate,
    db: AsyncSession = Depends(get_db),
    parent_id: UUID = Depends(get_current_parent_id),
):
    name = payload.name.strip()
    existing = (
        await db.execute(select(Subject).where(func.lower(Subject.name) == name.lower()))
    ).scalar_one_or_none()
    if existing is not None:
        return SubjectOut(id=existing.id, name=existing.name, description=existing.description)

    subject = Subject(name=name, description=payload.description)
    db.add(subject)
    await db.commit()
    await db.refresh(subject)
    return SubjectOut(id=subject.id, name=subject.name, description=subject.description)


@router.get("/{subject_id}/topics", response_model=list[Topic])
async def list_topics(subject_id: UUID, db: AsyncSession = Depends(get_db)):
    topics = (
        await db.execute(
            select(TopicOrm).where(TopicOrm.subject_id == subject_id).order_by(TopicOrm.sort_order, TopicOrm.name)
        )
    ).scalars().all()
    return [Topic(id=t.id, subject_id=t.subject_id, name=t.name) for t in topics]
