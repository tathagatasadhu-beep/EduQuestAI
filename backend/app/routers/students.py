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
from app.db.orm import ReviewQueue, Student, StudentAssignment, Subject, Attempt, Question, Topic
from app.models.schemas import (
    AssignedSubjectOut,
    AssignedTopicOut,
    AssignmentCreate,
    AssignmentOut,
    AssignmentRolloverRequest,
    BadgeOut,
    LoginCodeOut,
    MasteryStat,
    MonthlyProgressStat,
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


async def _fetch_assignment_rows(
    db: AsyncSession, student_id: UUID, *, only_active: bool = True, as_of: datetime | None = None
) -> list[StudentAssignment]:
    """Raw assignment rows for a student. `only_active=True` (the default)
    applies point-in-time filtering — active_from/active_until both null
    means "always active" (every pre-month-picker row, and today's behavior
    for anyone not using it); otherwise the row must currently be inside its
    half-open [active_from, active_until) window. `only_active=False` (used
    by badge-earning and, deliberately, nowhere else) ignores the window
    entirely — see migration 009 for why that must not regress."""
    stmt = select(StudentAssignment).where(StudentAssignment.student_id == student_id)
    if only_active:
        moment = as_of or datetime.now(timezone.utc)
        stmt = stmt.where(
            (StudentAssignment.active_from.is_(None)) | (StudentAssignment.active_from <= moment),
            (StudentAssignment.active_until.is_(None)) | (StudentAssignment.active_until > moment),
        )
    return (await db.execute(stmt)).scalars().all()


async def _fetch_overlapping_rows(
    db: AsyncSession, student_id: UUID, active_from: datetime, active_until: datetime
) -> list[StudentAssignment]:
    """Assignment rows whose own window overlaps the requested
    [active_from, active_until) range at all — used for "what was in scope
    at any point during this period," e.g. the progress view. Standard
    half-open interval overlap test, NULL treated as +/-infinity."""
    stmt = select(StudentAssignment).where(
        StudentAssignment.student_id == student_id,
        (StudentAssignment.active_from.is_(None)) | (StudentAssignment.active_from < active_until),
        (StudentAssignment.active_until.is_(None)) | (StudentAssignment.active_until > active_from),
    )
    return (await db.execute(stmt)).scalars().all()


async def _expand_to_subject_topics(
    db: AsyncSession, rows: list[StudentAssignment]
) -> list[tuple[Subject, list[Topic]]]:
    """A `topic_id=null` assignment row means "whole subject" — expands to every
    topic under it. A subject with any specific-topic rows only includes those
    topics, even if a whole-subject row doesn't also exist for it."""
    if not rows:
        return []

    subject_ids = {r.subject_id for r in rows}
    whole_subject_ids = {r.subject_id for r in rows if r.topic_id is None}
    specific_by_subject: dict[UUID, set[UUID]] = {}
    for r in rows:
        if r.topic_id is not None:
            specific_by_subject.setdefault(r.subject_id, set()).add(r.topic_id)

    subjects = (await db.execute(select(Subject).where(Subject.id.in_(subject_ids)))).scalars().all()
    all_topics = (
        await db.execute(
            select(Topic).where(Topic.subject_id.in_(subject_ids)).order_by(Topic.sort_order, Topic.name)
        )
    ).scalars().all()

    result = []
    for subject in subjects:
        if subject.id in whole_subject_ids:
            topics = [t for t in all_topics if t.subject_id == subject.id]
        else:
            allowed = specific_by_subject.get(subject.id, set())
            topics = [t for t in all_topics if t.subject_id == subject.id and t.id in allowed]
        result.append((subject, topics))
    result.sort(key=lambda pair: (pair[0].grade_level or "", pair[0].name))
    return result


async def _resolve_assigned_subjects(db: AsyncSession, student_id: UUID) -> list[tuple[Subject, list[Topic]]]:
    """Currently-active assignments (point-in-time), expanded to
    (subject, topics) pairs. This is what the student's Practice/My Subjects
    picker reads — the one place where the active window actually narrows
    what's shown, fixing the "everything ever assigned stays visible
    forever" problem migration 009 was added for."""
    rows = await _fetch_assignment_rows(db, student_id, only_active=True)
    return await _expand_to_subject_topics(db, rows)


async def _upsert_assignment(
    db: AsyncSession,
    student_id: UUID,
    subject_id: UUID,
    topic_id: UUID | None,
    active_from: datetime | None,
    active_until: datetime | None,
) -> StudentAssignment:
    """Create-or-return on the full (student, subject, topic, active_from,
    active_until) key — deliberately NOT just (student, subject, topic).

    A given (subject, topic) can have a DIFFERENT row per distinct window: a
    September row and an October row for the same topic are two separate
    rows, not one row whose window gets moved. This is what makes the
    progress view stay accurate for a past month after a parent rolls
    forward to a new one — if re-assigning for October instead mutated
    September's existing row in place, September's assignment set (and
    therefore what "was in scope" for September's progress) would silently
    change after the fact, even though the attempts happened in September.
    Matching on the exact window keeps re-POSTing the *same* month idempotent
    (no duplicate rows from an accidental double-click) while any genuinely
    different window — including what rollover always requests — creates a
    new row, preserving every prior month's assignment set as its own
    permanent record."""
    existing = (
        await db.execute(
            select(StudentAssignment).where(
                StudentAssignment.student_id == student_id,
                StudentAssignment.subject_id == subject_id,
                StudentAssignment.topic_id == topic_id,
                StudentAssignment.active_from == active_from,
                StudentAssignment.active_until == active_until,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        return existing

    assignment = StudentAssignment(
        student_id=student_id, subject_id=subject_id, topic_id=topic_id,
        active_from=active_from, active_until=active_until,
    )
    db.add(assignment)
    await db.commit()
    await db.refresh(assignment)
    return assignment


async def _badges_for_student(db: AsyncSession, student: Student) -> list[BadgeOut]:
    mastery = await _mastery_for_student(db, student.id)
    mastery_by_topic = {m.topic_id: m for m in mastery}

    has_any_attempt = (
        await db.execute(select(Attempt.id).where(Attempt.student_id == student.id).limit(1))
    ).scalar_one_or_none() is not None
    has_resolved_review = (
        await db.execute(
            select(ReviewQueue.id).where(ReviewQueue.student_id == student.id, ReviewQueue.resolved.is_(True)).limit(1)
        )
    ).scalar_one_or_none() is not None
    topic_mastered = any(m.total_first_attempts > 0 and m.accuracy_rate >= 80 for m in mastery)

    # only_active=False deliberately: a badge already earned (or earnable
    # from history) shouldn't disappear just because this month's assignment
    # window moved on — badges treat "assigned" as all-time, unlike Practice.
    all_time_rows = await _fetch_assignment_rows(db, student.id, only_active=False)
    assigned = await _expand_to_subject_topics(db, all_time_rows)
    subject_champion = False
    for _subject, topics in assigned:
        if not topics:
            continue
        stats = [mastery_by_topic.get(t.id) for t in topics]
        if all(s is not None and s.total_first_attempts > 0 and s.accuracy_rate >= 80 for s in stats):
            subject_champion = True
            break

    level = student.xp_total // 500 + 1

    return [
        BadgeOut(id="first_quest", name="First Quest", description="Answer your first question", earned=has_any_attempt),
        BadgeOut(id="streak_starter", name="Streak Starter", description="Practice 3 days in a row", earned=student.streak_days >= 3),
        BadgeOut(id="streak_master", name="Streak Master", description="Practice 7 days in a row", earned=student.streak_days >= 7),
        BadgeOut(id="topic_master", name="Topic Master", description="Reach 80% mastery in any topic", earned=topic_mastered),
        BadgeOut(id="subject_champion", name="Subject Champion", description="Master every topic in one of your subjects", earned=subject_champion),
        BadgeOut(id="comeback_kid", name="Comeback Kid", description="Fix a missed question by answering it right twice", earned=has_resolved_review),
        BadgeOut(id="level_5", name="Level 5", description="Reach Level 5", earned=level >= 5),
        BadgeOut(id="level_10", name="Level 10", description="Reach Level 10", earned=level >= 10),
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


@router.get("/me/assigned-subjects", response_model=list[AssignedSubjectOut])
async def get_my_assigned_subjects(
    db: AsyncSession = Depends(get_db),
    student: dict = Depends(get_current_student),
):
    """Populates "My Subjects" and the "Practice" tab — a parent-assigned
    subject/topic subset, not the full library."""
    resolved = await _resolve_assigned_subjects(db, student["student_id"])
    return [
        AssignedSubjectOut(
            id=subject.id,
            name=subject.name,
            grade_level=subject.grade_level,
            topics=[AssignedTopicOut(id=t.id, name=t.name, sort_order=t.sort_order) for t in topics],
        )
        for subject, topics in resolved
    ]


@router.get("/me/badges", response_model=list[BadgeOut])
async def get_my_badges(
    db: AsyncSession = Depends(get_db),
    student: dict = Depends(get_current_student),
):
    s = await db.get(Student, student["student_id"])
    if s is None:
        raise HTTPException(status_code=404, detail="Student not found.")
    return await _badges_for_student(db, s)


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
        topic_id=a.topic_id, topic_name=topic_name,
        active_from=a.active_from, active_until=a.active_until, created_at=a.created_at,
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

    assignment = await _upsert_assignment(
        db, student_id, payload.subject_id, payload.topic_id, payload.active_from, payload.active_until
    )
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


@router.post("/{student_id}/assignments/rollover", response_model=list[AssignmentOut])
async def rollover_assignments(
    student_id: UUID,
    payload: AssignmentRolloverRequest,
    db: AsyncSession = Depends(get_db),
    parent_id: UUID = Depends(get_current_parent_id),
):
    """Copies today's currently-active assignment set forward onto a new
    window (e.g. "repeat September's picks for October") — each row keeps
    its original subject/topic shape (a whole-subject row stays a
    whole-subject row) and is created via the same helper `create_assignment`
    uses. The source rows (September's) are left completely untouched, so
    September's progress view stays accurate after rolling forward; a second
    rollover onto the same target window is idempotent (matches the existing
    October row rather than duplicating it)."""
    await _get_owned_student_or_404(db, student_id, parent_id)
    source_rows = await _fetch_assignment_rows(db, student_id, only_active=True)
    if not source_rows:
        return []

    subject_ids = {r.subject_id for r in source_rows}
    topic_ids = {r.topic_id for r in source_rows if r.topic_id is not None}
    subjects_by_id = {
        s.id: s for s in (await db.execute(select(Subject).where(Subject.id.in_(subject_ids)))).scalars().all()
    }
    topics_by_id = {
        t.id: t for t in (await db.execute(select(Topic).where(Topic.id.in_(topic_ids)))).scalars().all()
    } if topic_ids else {}

    results = []
    for row in source_rows:
        assignment = await _upsert_assignment(
            db, student_id, row.subject_id, row.topic_id, payload.active_from, payload.active_until
        )
        subject_name = subjects_by_id[row.subject_id].name
        topic_name = topics_by_id[row.topic_id].name if row.topic_id is not None else None
        results.append(_assignment_out(assignment, subject_name, topic_name))
    return results


@router.get("/{student_id}/progress", response_model=list[MonthlyProgressStat])
async def get_progress(
    student_id: UUID,
    active_from: datetime,
    active_until: datetime,
    db: AsyncSession = Depends(get_db),
    parent_id: UUID = Depends(get_current_parent_id),
):
    """Progress for exactly what was assigned at any point during
    [active_from, active_until) — one row per in-scope topic, 0 attempts if
    the student hasn't touched it yet, so "assigned but not started" is
    visible rather than silently omitted."""
    await _get_owned_student_or_404(db, student_id, parent_id)
    if active_from >= active_until:
        raise HTTPException(status_code=400, detail="active_from must be before active_until.")

    overlapping_rows = await _fetch_overlapping_rows(db, student_id, active_from, active_until)
    assigned = await _expand_to_subject_topics(db, overlapping_rows)
    if not assigned:
        return []

    topic_subject: dict[UUID, Subject] = {}
    topic_names: dict[UUID, str] = {}
    for subject, topics in assigned:
        for t in topics:
            topic_subject[t.id] = subject
            topic_names[t.id] = t.name
    topic_ids = list(topic_subject.keys())

    stmt = (
        select(
            Topic.id.label("topic_id"),
            Topic.name.label("topic_name"),
            func.count(Attempt.id).label("total_first_attempts"),
            func.sum(cast(Attempt.is_correct, Integer)).label("correct_first_attempts"),
        )
        .join(Question, Question.topic_id == Topic.id)
        .join(Attempt, Attempt.question_id == Question.id)
        .where(
            Topic.id.in_(topic_ids),
            Attempt.student_id == student_id,
            Attempt.attempt_number == 1,
            Attempt.answered_at >= active_from,
            Attempt.answered_at < active_until,
        )
        .group_by(Topic.id, Topic.name)
    )
    attempt_rows = {r.topic_id: r for r in (await db.execute(stmt)).all()}

    stats = []
    for topic_id, subject in topic_subject.items():
        topic_name = topic_names[topic_id]
        r = attempt_rows.get(topic_id)
        total = r.total_first_attempts if r else 0
        correct = (r.correct_first_attempts or 0) if r else 0
        stats.append(
            MonthlyProgressStat(
                topic_id=topic_id, topic_name=topic_name,
                subject_id=subject.id, subject_name=subject.name,
                total_first_attempts=total,
                accuracy_rate=round(correct / total * 100, 1) if total else 0.0,
            )
        )
    return stats


@router.get("/{student_id}/badges", response_model=list[BadgeOut])
async def get_student_badges(
    student_id: UUID,
    db: AsyncSession = Depends(get_db),
    parent_id: UUID = Depends(get_current_parent_id),
):
    student = await _get_owned_student_or_404(db, student_id, parent_id)
    return await _badges_for_student(db, student)
