"""Subjects/topics router — real implementation. Mostly read-only, global
library (not scoped by parent — every family shares the same subject/topic
catalog); creation just requires being logged in as some parent, since
there's no seed data or admin UI and a parent has to be able to add
"AP Calculus"/"SAT Math"/etc. before they can upload a worksheet into it.

Subjects/topics can't be deleted while they still have a non-deleted PDF
attached — the parent has to delete/reassign those PDFs first (see pdfs.py).
Once that's clear, any *orphaned* questions left behind by an already-deleted
PDF (soft-deleted, `is_active=False`, but the row itself still exists — see
pdfs.py's delete comment) are hard-deleted here before the topic/subject
itself is deleted. `questions.topic_id` is NOT NULL with no cascade, so
leaving those rows in place would otherwise fail with a raw FK-violation
500 the moment a topic/subject delete tried to cascade past them. This is
only safe because we first confirm no student has actually attempted any of
those orphaned questions (`attempts.question_id` cascades from `questions`,
so hard-deleting would silently erase real practice history otherwise)."""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.orm import Attempt, Pdf, Question, Subject, Topic as TopicOrm
from app.db.session import get_db
from app.models.schemas import (
    ReorderItem,
    SubjectCreate,
    SubjectOut,
    SubjectUpdate,
    Topic,
    TopicCreate,
    TopicUpdate,
)
from app.routers.auth import get_current_parent_id

router = APIRouter()


def _subject_out(s: Subject) -> SubjectOut:
    return SubjectOut(id=s.id, name=s.name, description=s.description, grade_level=s.grade_level, sort_order=s.sort_order)


def _topic_out(t: TopicOrm) -> Topic:
    return Topic(id=t.id, subject_id=t.subject_id, name=t.name, sort_order=t.sort_order)


@router.get("", response_model=list[SubjectOut])
async def list_subjects(db: AsyncSession = Depends(get_db)):
    subjects = (
        await db.execute(select(Subject).order_by(Subject.grade_level, Subject.sort_order, Subject.name))
    ).scalars().all()
    return [_subject_out(s) for s in subjects]


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
        return _subject_out(existing)

    subject = Subject(name=name, description=payload.description, grade_level=payload.grade_level)
    db.add(subject)
    await db.commit()
    await db.refresh(subject)
    return _subject_out(subject)


async def _topics_have_attempts(db: AsyncSession, topic_ids: list[UUID]) -> bool:
    if not topic_ids:
        return False
    exists = (
        await db.execute(
            select(Attempt.id)
            .join(Question, Question.id == Attempt.question_id)
            .where(Question.topic_id.in_(topic_ids))
            .limit(1)
        )
    ).scalar_one_or_none()
    return exists is not None


async def _purge_orphaned_questions(db: AsyncSession, topic_ids: list[UUID]) -> None:
    """Hard-deletes questions under these topics (cascades to answer_keys) —
    only call after `_topics_have_attempts` has confirmed none of them have
    ever been attempted by a student."""
    if not topic_ids:
        return
    await db.execute(Question.__table__.delete().where(Question.topic_id.in_(topic_ids)))


async def _get_subject_or_404(db: AsyncSession, subject_id: UUID) -> Subject:
    subject = await db.get(Subject, subject_id)
    if subject is None:
        raise HTTPException(status_code=404, detail="Subject not found.")
    return subject


# Registered ahead of PATCH /{subject_id} below: FastAPI matches routes in
# registration order, and the wildcard route would otherwise swallow
# "/reorder" requests first and fail UUID parsing on "reorder" itself (see
# the equivalent note in students.py::get_my_profile).
@router.patch("/reorder", response_model=list[SubjectOut])
async def reorder_subjects(
    payload: list[ReorderItem],
    db: AsyncSession = Depends(get_db),
    parent_id: UUID = Depends(get_current_parent_id),
):
    subjects = (await db.execute(select(Subject).where(Subject.id.in_([i.id for i in payload])))).scalars().all()
    by_id = {s.id: s for s in subjects}
    for item in payload:
        if item.id in by_id:
            by_id[item.id].sort_order = item.sort_order
    await db.commit()
    all_subjects = (
        await db.execute(select(Subject).order_by(Subject.grade_level, Subject.sort_order, Subject.name))
    ).scalars().all()
    return [_subject_out(s) for s in all_subjects]


@router.patch("/{subject_id}", response_model=SubjectOut)
async def update_subject(
    subject_id: UUID,
    payload: SubjectUpdate,
    db: AsyncSession = Depends(get_db),
    parent_id: UUID = Depends(get_current_parent_id),
):
    subject = await _get_subject_or_404(db, subject_id)
    if payload.name is not None:
        subject.name = payload.name.strip()
    if payload.description is not None:
        subject.description = payload.description
    if payload.grade_level is not None:
        subject.grade_level = payload.grade_level
    await db.commit()
    await db.refresh(subject)
    return _subject_out(subject)


@router.delete("/{subject_id}", status_code=204)
async def delete_subject(
    subject_id: UUID,
    db: AsyncSession = Depends(get_db),
    parent_id: UUID = Depends(get_current_parent_id),
):
    subject = await _get_subject_or_404(db, subject_id)
    has_pdfs = (
        await db.execute(
            select(Pdf.id).where(Pdf.subject_id == subject_id, Pdf.deleted_at.is_(None)).limit(1)
        )
    ).scalar_one_or_none()
    if has_pdfs is not None:
        raise HTTPException(
            status_code=400,
            detail="This subject still has worksheets in it — delete or reassign them first.",
        )

    topic_ids = (
        await db.execute(select(TopicOrm.id).where(TopicOrm.subject_id == subject_id))
    ).scalars().all()
    if await _topics_have_attempts(db, topic_ids):
        raise HTTPException(
            status_code=400,
            detail="A student has already practiced questions in this subject, so it can't be deleted.",
        )

    await _purge_orphaned_questions(db, topic_ids)
    await db.delete(subject)
    await db.commit()


@router.get("/{subject_id}/topics", response_model=list[Topic])
async def list_topics(subject_id: UUID, db: AsyncSession = Depends(get_db)):
    topics = (
        await db.execute(
            select(TopicOrm).where(TopicOrm.subject_id == subject_id).order_by(TopicOrm.sort_order, TopicOrm.name)
        )
    ).scalars().all()
    return [_topic_out(t) for t in topics]


@router.post("/{subject_id}/topics", response_model=Topic)
async def create_topic(
    subject_id: UUID,
    payload: TopicCreate,
    db: AsyncSession = Depends(get_db),
    parent_id: UUID = Depends(get_current_parent_id),
):
    await _get_subject_or_404(db, subject_id)
    name = payload.name.strip()
    existing = (
        await db.execute(
            select(TopicOrm).where(TopicOrm.subject_id == subject_id, func.lower(TopicOrm.name) == name.lower())
        )
    ).scalar_one_or_none()
    if existing is not None:
        return _topic_out(existing)

    topic = TopicOrm(subject_id=subject_id, name=name)
    db.add(topic)
    await db.commit()
    await db.refresh(topic)
    return _topic_out(topic)


async def _get_topic_or_404(db: AsyncSession, topic_id: UUID) -> TopicOrm:
    topic = await db.get(TopicOrm, topic_id)
    if topic is None:
        raise HTTPException(status_code=404, detail="Topic not found.")
    return topic


@router.patch("/topics/{topic_id}", response_model=Topic)
async def update_topic(
    topic_id: UUID,
    payload: TopicUpdate,
    db: AsyncSession = Depends(get_db),
    parent_id: UUID = Depends(get_current_parent_id),
):
    topic = await _get_topic_or_404(db, topic_id)
    topic.name = payload.name.strip()
    await db.commit()
    await db.refresh(topic)
    return _topic_out(topic)


@router.delete("/topics/{topic_id}", status_code=204)
async def delete_topic(
    topic_id: UUID,
    db: AsyncSession = Depends(get_db),
    parent_id: UUID = Depends(get_current_parent_id),
):
    topic = await _get_topic_or_404(db, topic_id)
    has_active_questions = (
        await db.execute(
            select(Question.id).where(Question.topic_id == topic_id, Question.is_active.is_(True)).limit(1)
        )
    ).scalar_one_or_none()
    if has_active_questions is not None:
        raise HTTPException(
            status_code=400,
            detail="This topic still has active worksheets in it — delete or reassign them first.",
        )

    if await _topics_have_attempts(db, [topic_id]):
        raise HTTPException(
            status_code=400,
            detail="A student has already practiced questions in this topic, so it can't be deleted.",
        )

    await _purge_orphaned_questions(db, [topic_id])
    await db.delete(topic)
    await db.commit()


@router.patch("/{subject_id}/topics/reorder", response_model=list[Topic])
async def reorder_topics(
    subject_id: UUID,
    payload: list[ReorderItem],
    db: AsyncSession = Depends(get_db),
    parent_id: UUID = Depends(get_current_parent_id),
):
    topics = (
        await db.execute(
            select(TopicOrm).where(TopicOrm.subject_id == subject_id, TopicOrm.id.in_([i.id for i in payload]))
        )
    ).scalars().all()
    by_id = {t.id: t for t in topics}
    for item in payload:
        if item.id in by_id:
            by_id[item.id].sort_order = item.sort_order
    await db.commit()
    all_topics = (
        await db.execute(
            select(TopicOrm).where(TopicOrm.subject_id == subject_id).order_by(TopicOrm.sort_order, TopicOrm.name)
        )
    ).scalars().all()
    return [_topic_out(t) for t in all_topics]
