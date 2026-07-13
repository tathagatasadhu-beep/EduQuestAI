"""
Students router — REAL implementation. This is the reference pattern:
copy this shape (real DB queries via SQLAlchemy async session, real
response models) when filling in the other stubbed routers.

Every query below is scoped by parent_user_id, using the logged-in parent's
id from `get_current_parent_id` (see auth.py for the Supabase JWT verification).
"""
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func, cast, Integer
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.db.orm import Student, StudentAssignment, Subject, Attempt, Question, Topic
from app.models.schemas import (
    AssignmentCreate,
    AssignmentOut,
    LoginCodeOut,
    MasteryStat,
    StudentCreate,
    StudentCreateOut,
    StudentOut,
    StudentUpdate,
)
from app.routers.auth import get_current_parent_id, get_current_student

router = APIRouter()


async def _get_owned_student_or_404(db: AsyncSession, student_id: UUID, parent_id: UUID) -> Student:
    student = (
        await db.execute(select(Student).where(Student.id == student_id, Student.parent_user_id == parent_id))
    ).scalar_one_or_none()
    if student is None:
        raise HTTPException(status_code=404, detail="Student not found.")
    return student


async def _mastery_for_student(db: AsyncSession, student_id: UUID) -> list[MasteryStat]:
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


@router.post("", response_model=StudentCreateOut)
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

    return StudentCreateOut(
        id=student.id,
        display_name=student.display_name,
        grade_level=student.grade_level,
        xp_total=student.xp_total,
        streak_days=student.streak_days,
        login_code=raw_code,
    )


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


@router.get("/me", response_model=StudentOut)
async def get_my_profile(
    db: AsyncSession = Depends(get_db),
    student: dict = Depends(get_current_student),
):
    """The student-side counterpart to list_students — used by the student
    dashboard, authenticated with the student's own login-code session.

    Registered ahead of `/{student_id}/mastery` below: FastAPI matches routes
    in registration order, and `/{student_id}` is a wildcard that would
    otherwise swallow `/me` requests first and 422 on the UUID parse.
    """
    s = await db.get(Student, student["student_id"])
    if s is None:
        raise HTTPException(status_code=404, detail="Student not found.")
    return StudentOut(
        id=s.id, display_name=s.display_name, grade_level=s.grade_level,
        xp_total=s.xp_total, streak_days=s.streak_days,
    )


@router.get("/me/mastery", response_model=list[MasteryStat])
async def get_my_mastery(
    db: AsyncSession = Depends(get_db),
    student: dict = Depends(get_current_student),
):
    return await _mastery_for_student(db, student["student_id"])


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
    await _get_owned_student_or_404(db, student_id, parent_id)
    return await _mastery_for_student(db, student_id)


@router.patch("/{student_id}", response_model=StudentOut)
async def update_student(
    student_id: UUID,
    payload: StudentUpdate,
    db: AsyncSession = Depends(get_db),
    parent_id: UUID = Depends(get_current_parent_id),
):
    student = await _get_owned_student_or_404(db, student_id, parent_id)
    if payload.display_name is not None:
        student.display_name = payload.display_name
    if payload.grade_level is not None:
        student.grade_level = payload.grade_level
    await db.commit()
    await db.refresh(student)
    return StudentOut(
        id=student.id, display_name=student.display_name, grade_level=student.grade_level,
        xp_total=student.xp_total, streak_days=student.streak_days,
    )


@router.post("/{student_id}/login-code/regenerate", response_model=LoginCodeOut)
async def regenerate_login_code(
    student_id: UUID,
    db: AsyncSession = Depends(get_db),
    parent_id: UUID = Depends(get_current_parent_id),
):
    student = await _get_owned_student_or_404(db, student_id, parent_id)
    raw_code = secrets.token_hex(3)
    student.login_code_hash = hashlib.sha256(raw_code.encode()).hexdigest()
    student.login_code_expires_at = datetime.now(timezone.utc) + timedelta(days=90)
    await db.commit()
    return LoginCodeOut(login_code=raw_code)


def _assignment_out(a: StudentAssignment, subject_name: str, topic_name: str | None) -> AssignmentOut:
    return AssignmentOut(
        id=a.id, subject_id=a.subject_id, subject_name=subject_name,
        topic_id=a.topic_id, topic_name=topic_name, created_at=a.created_at,
    )


@router.get("/{student_id}/assignments", response_model=list[AssignmentOut])
async def list_assignments(
    student_id: UUID,
    db: AsyncSession = Depends(get_db),
    parent_id: UUID = Depends(get_current_parent_id),
):
    await _get_owned_student_or_404(db, student_id, parent_id)
    rows = (
        await db.execute(
            select(StudentAssignment, Subject.name, Topic.name)
            .join(Subject, Subject.id == StudentAssignment.subject_id)
            .outerjoin(Topic, Topic.id == StudentAssignment.topic_id)
            .where(StudentAssignment.student_id == student_id)
            .order_by(StudentAssignment.created_at)
        )
    ).all()
    return [_assignment_out(a, subject_name, topic_name) for a, subject_name, topic_name in rows]


@router.post("/{student_id}/assignments", response_model=AssignmentOut)
async def create_assignment(
    student_id: UUID,
    payload: AssignmentCreate,
    db: AsyncSession = Depends(get_db),
    parent_id: UUID = Depends(get_current_parent_id),
):
    await _get_owned_student_or_404(db, student_id, parent_id)
    subject = await db.get(Subject, payload.subject_id)
    if subject is None:
        raise HTTPException(status_code=404, detail="Subject not found.")
    topic_name = None
    if payload.topic_id is not None:
        topic = await db.get(Topic, payload.topic_id)
        if topic is None or topic.subject_id != payload.subject_id:
            raise HTTPException(status_code=404, detail="Topic not found in this subject.")
        topic_name = topic.name

    existing = (
        await db.execute(
            select(StudentAssignment).where(
                StudentAssignment.student_id == student_id,
                StudentAssignment.subject_id == payload.subject_id,
                StudentAssignment.topic_id == payload.topic_id,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        return _assignment_out(existing, subject.name, topic_name)

    assignment = StudentAssignment(student_id=student_id, subject_id=payload.subject_id, topic_id=payload.topic_id)
    db.add(assignment)
    await db.commit()
    await db.refresh(assignment)
    return _assignment_out(assignment, subject.name, topic_name)


@router.delete("/{student_id}/assignments/{assignment_id}", status_code=204)
async def delete_assignment(
    student_id: UUID,
    assignment_id: UUID,
    db: AsyncSession = Depends(get_db),
    parent_id: UUID = Depends(get_current_parent_id),
):
    await _get_owned_student_or_404(db, student_id, parent_id)
    assignment = (
        await db.execute(
            select(StudentAssignment).where(
                StudentAssignment.id == assignment_id, StudentAssignment.student_id == student_id
            )
        )
    ).scalar_one_or_none()
    if assignment is None:
        raise HTTPException(status_code=404, detail="Assignment not found.")
    await db.delete(assignment)
    await db.commit()
