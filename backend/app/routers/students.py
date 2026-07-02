"""
Students router — REAL implementation. This is the reference pattern:
copy this shape (real DB queries via SQLAlchemy async session, real
response models) when filling in the other stubbed routers.

NOTE: `get_current_parent_id` is still a stub — swap it for real Supabase
JWT verification once auth.py is wired up. Every query below is already
written to be scoped by parent_user_id, so wiring auth is a one-line change.
"""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func, cast, Integer
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.orm import Student, Attempt, Question, Topic
from app.models.schemas import StudentCreate, StudentOut, MasteryStat

router = APIRouter()


def get_current_parent_id() -> UUID:
    """
    TODO: replace with real auth. Decode the Supabase JWT from the
    Authorization header and return its `sub` claim as a UUID.
    Every route below already depends on this function, so once it's real,
    every query is automatically scoped to the logged-in parent.
    """
    raise HTTPException(status_code=501, detail="Auth not wired up yet — see auth.py TODOs.")


@router.post("", response_model=StudentOut)
async def create_student(
    payload: StudentCreate,
    db: AsyncSession = Depends(get_db),
    parent_id: UUID = Depends(get_current_parent_id),
):
    raw_code = secrets.token_hex(3)  # e.g. "a1b2c3" — shown to parent once, given to the child
    code_hash = hashlib.sha256(raw_code.encode()).hexdigest()

    student = Student(
        parent_user_id=parent_id,
        display_name=payload.display_name,
        grade_level=payload.grade_level,
        login_code_hash=code_hash,
        login_code_expires_at=datetime.now(timezone.utc) + timedelta(days=90),
    )
    db.add(student)
    await db.commit()
    await db.refresh(student)

    return StudentOut(
        id=student.id,
        display_name=student.display_name,
        grade_level=student.grade_level,
        xp_total=student.xp_total,
        streak_days=student.streak_days,
    )
    # NOTE: return `raw_code` to the parent in the real response too (add a
    # field to StudentOut) — it's the only time the plaintext code exists.


@router.get("", response_model=list[StudentOut])
async def list_students(
    db: AsyncSession = Depends(get_db),
    parent_id: UUID = Depends(get_current_parent_id),
):
    result = await db.execute(select(Student).where(Student.parent_user_id == parent_id))
    students = result.scalars().all()
    return [
        StudentOut(
            id=s.id, display_name=s.display_name, grade_level=s.grade_level,
            xp_total=s.xp_total, streak_days=s.streak_days,
        )
        for s in students
    ]


@router.get("/{student_id}/mastery", response_model=list[MasteryStat])
async def get_mastery(
    student_id: UUID,
    db: AsyncSession = Depends(get_db),
    parent_id: UUID = Depends(get_current_parent_id),
):
    """
    Implements the spec's mastery formula:
        accuracy_rate = (correct first attempts / total first attempts) * 100
    grouped by topic, using only attempt_number = 1 rows (first tries only —
    retries from the review queue don't count toward mastery).
    """
    # Ownership check: student must belong to this parent.
    owns = await db.execute(
        select(Student.id).where(Student.id == student_id, Student.parent_user_id == parent_id)
    )
    if owns.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Student not found.")

    stmt = (
        select(
            Topic.id.label("topic_id"),
            Topic.name.label("topic_name"),
            func.count(Attempt.id).label("total_first_attempts"),
            func.sum(cast(Attempt.is_correct, Integer)).label("correct_first_attempts"),
        )
        .join(Question, Question.topic_id == Topic.id)
        .join(Attempt, Attempt.question_id == Question.id)
        .where(Attempt.student_id == student_id, Attempt.attempt_number == 1)
        .group_by(Topic.id, Topic.name)
    )
    rows = (await db.execute(stmt)).all()

    return [
        MasteryStat(
            topic_id=r.topic_id,
            topic_name=r.topic_name,
            total_first_attempts=r.total_first_attempts,
            accuracy_rate=round((r.correct_first_attempts or 0) / r.total_first_attempts * 100, 1)
            if r.total_first_attempts else 0.0,
        )
        for r in rows
    ]
