"""
Quiz engine — real implementation.

next-question: for a given topic, serve (1) a due review-queue item — a
question the student previously missed and hasn't yet answered correctly
twice — before (2) a fresh question in the topic they haven't attempted, and
only once both are exhausted, (3) the question they practiced longest ago in
that topic, so the quiz never dead-ends even after full topic mastery.

questions: for a given topic (+ optional attempt-history filter), returns the
*whole* matching active-question set up front — powers the fixed-list
practice session (sidebar of question pills), as opposed to next-question's
one-at-a-time adaptive serving.

reveal: looks up the correct answer for a free-response question without
grading or recording an attempt, so the frontend can show it before the
student self-reports whether they got it right (see submit below).

submit: scores the answer, records the attempt (attempt_number derived from
prior attempts for this student+question), and updates the review queue —
resetting/inserting on a miss, incrementing (and resolving at 2 in a row) on
a correct retry. For free-response questions, `is_correct` comes from the
student's own self-report (paired with reveal above) rather than an exact
string match, since answers like proofs have no single canonical string —
multiple_choice is unaffected and still auto-graded.

A wrong first attempt on any auto-graded question (not self-assessment) gets
one immediate in-sitting retry instead of being scored right away: nothing is
finalized (0 XP, review queue untouched, `can_retry=True`) until the student
either gets it right on the retry (half XP, still flagged for review — a
retry was needed either way) or misses it again (0 XP, flagged for review,
same as an outright miss always was). The frontend signals a retry via
`AttemptSubmit.is_retry=True` on the 2nd call.
"""
import asyncio
import json
from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.supabase_client import QUESTION_IMAGES_BUCKET, get_supabase_admin
from app.db.orm import AnswerKey, Attempt, Question, ReviewQueue, Student, Subject, Topic
from app.db.session import get_db
from app.models.schemas import AttemptResult, AttemptSubmit, QuestionOut, RevealOut
from app.routers.auth import get_current_student

router = APIRouter()

# A missed question won't be re-served until this much time has passed, so a
# student can't rack up "2 correct in a row" by just answering it twice back-to-back.
REVIEW_COOLDOWN = timedelta(minutes=30)

XP_PER_CORRECT = 10
XP_REVIEW_RESOLVED_BONUS = 15

QUESTION_FILTERS = {"all", "missed_1st", "missed_2nd"}


async def _topic_and_subject(db: AsyncSession, topic_id: UUID) -> tuple[Topic, Subject]:
    topic = await db.get(Topic, topic_id)
    if topic is None:
        raise HTTPException(status_code=404, detail="Topic not found.")
    subject = await db.get(Subject, topic.subject_id)
    if subject is None:
        raise HTTPException(status_code=404, detail="Subject not found.")
    return topic, subject


async def _serialize_question(question: Question, subject: Subject, options: list[AnswerKey]) -> QuestionOut:
    image_url = None
    if question.image_path:
        try:
            admin = get_supabase_admin()
            signed = await asyncio.to_thread(
                admin.storage.from_(QUESTION_IMAGES_BUCKET).create_signed_url, question.image_path, 600
            )
            image_url = signed["signedURL"]
        except Exception:
            image_url = None  # non-fatal — the question is still usable without its diagram

    return QuestionOut(
        id=question.id,
        topic_id=question.topic_id,
        subject_id=subject.id,
        subject_name=subject.name,
        prompt_text=question.prompt_text,
        prompt_latex=question.prompt_latex,
        image_path=image_url,
        difficulty=question.difficulty,
        question_type=question.question_type,
        options=[{"option_label": o.option_label, "option_text": o.option_text} for o in options],
        requires_self_assessment=question.requires_self_assessment,
    )


def _correct_answer_text(question_type: str, answer_rows: list[AnswerKey]) -> str:
    correct_row = next((a for a in answer_rows if a.is_correct), None)
    if correct_row is None:
        return ""
    if question_type == "number_line":
        parsed = _parse_interval_json(correct_row.option_text)
        return parsed["text"] if parsed else correct_row.option_text
    return correct_row.option_label if question_type == "multiple_choice" and correct_row.option_label else correct_row.option_text


def _parse_interval_json(raw: str) -> dict | None:
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None
    if not isinstance(data, dict) or not isinstance(data.get("intervals"), list):
        return None
    return data


_INTERVAL_EPSILON = 1e-6


def _intervals_match(a: dict, b: dict) -> bool:
    def bound_matches(a_val, a_incl, b_val, b_incl) -> bool:
        if a_val is None or b_val is None:
            return a_val is None and b_val is None
        return abs(a_val - b_val) < _INTERVAL_EPSILON and bool(a_incl) == bool(b_incl)

    return bound_matches(a.get("lower"), a.get("lower_inclusive"), b.get("lower"), b.get("lower_inclusive")) and bound_matches(
        a.get("upper"), a.get("upper_inclusive"), b.get("upper"), b.get("upper_inclusive")
    )


def _matches_number_line(submitted: str, correct_json: str) -> bool:
    """Compares the student's drawn interval(s) against the correct answer —
    both sides use the same {"intervals": [{"lower", "lower_inclusive",
    "upper", "upper_inclusive"}]} shape (see ai-engine/pipeline.py's
    number_line_answer). Sorted by lower bound (None/-infinity first) before
    a positional comparison so interval order never matters."""
    submitted_data = _parse_interval_json(submitted)
    correct_data = _parse_interval_json(correct_json)
    if not submitted_data or not correct_data:
        return False
    submitted_intervals = submitted_data["intervals"]
    correct_intervals = correct_data["intervals"]
    if len(submitted_intervals) != len(correct_intervals):
        return False

    def sort_key(interval: dict):
        lower = interval.get("lower")
        return (lower is None, lower if lower is not None else 0)

    submitted_sorted = sorted(submitted_intervals, key=sort_key)
    correct_sorted = sorted(correct_intervals, key=sort_key)
    return all(_intervals_match(s, c) for s, c in zip(submitted_sorted, correct_sorted))


def _apply_streak(student: Student, prior_last_attempt_at: datetime | None, today: date) -> None:
    """Daily-practice streak, derived from attempt history rather than a
    separately-maintained 'last active' column. Any practice counts — this
    runs once per submit, using the most recent attempt *before* the one
    just recorded, so it only advances on the first attempt of a new day."""
    if prior_last_attempt_at is None:
        student.streak_days = 1
        return
    prior_date = prior_last_attempt_at.date()
    if prior_date == today:
        return  # already practiced today — streak unchanged
    if prior_date == today - timedelta(days=1):
        student.streak_days += 1
    else:
        student.streak_days = 1  # gap of 2+ days — streak resets


@router.get("/next-question", response_model=QuestionOut)
async def next_question(
    topic_id: UUID,
    db: AsyncSession = Depends(get_db),
    student: dict = Depends(get_current_student),
):
    student_id = student["student_id"]
    _, subject = await _topic_and_subject(db, topic_id)
    due_cutoff = datetime.now(timezone.utc) - REVIEW_COOLDOWN

    due_review_stmt = (
        select(Question)
        .join(ReviewQueue, ReviewQueue.question_id == Question.id)
        .where(
            ReviewQueue.student_id == student_id,
            ReviewQueue.resolved.is_(False),
            Question.topic_id == topic_id,
            Question.is_active.is_(True),
            or_(ReviewQueue.last_seen_at.is_(None), ReviewQueue.last_seen_at < due_cutoff),
        )
        .order_by(ReviewQueue.last_seen_at.asc().nulls_first())
        .limit(1)
    )
    question = (await db.execute(due_review_stmt)).scalars().first()

    if question is None:
        attempted_ids = select(Attempt.question_id).where(Attempt.student_id == student_id)
        fresh_stmt = (
            select(Question)
            .where(Question.topic_id == topic_id, Question.is_active.is_(True), Question.id.notin_(attempted_ids))
            .order_by(Question.sort_order, Question.id)
            .limit(1)
        )
        question = (await db.execute(fresh_stmt)).scalars().first()

    if question is None:
        stalest_stmt = (
            select(Question)
            .join(Attempt, Attempt.question_id == Question.id)
            .where(Question.topic_id == topic_id, Question.is_active.is_(True), Attempt.student_id == student_id)
            .group_by(Question.id)
            .order_by(func.max(Attempt.answered_at).asc())
            .limit(1)
        )
        question = (await db.execute(stalest_stmt)).scalars().first()

    if question is None:
        raise HTTPException(status_code=404, detail="No questions available for this topic.")

    options = (
        (await db.execute(select(AnswerKey).where(AnswerKey.question_id == question.id)))
        .scalars()
        .all()
    )

    return await _serialize_question(question, subject, options)


@router.get("/questions", response_model=list[QuestionOut])
async def list_questions(
    topic_id: UUID,
    filter: str = "all",
    db: AsyncSession = Depends(get_db),
    student: dict = Depends(get_current_student),
):
    """Powers the new fixed-list practice session (sidebar of question pills) —
    unlike next-question, this returns the *whole* matching set up front so the
    frontend can track progress through a known-size batch."""
    if filter not in QUESTION_FILTERS:
        raise HTTPException(status_code=400, detail="filter must be one of: all, missed_1st, missed_2nd.")

    student_id = student["student_id"]
    _, subject = await _topic_and_subject(db, topic_id)

    stmt = select(Question).where(Question.topic_id == topic_id, Question.is_active.is_(True))
    if filter == "missed_1st":
        stmt = stmt.join(Attempt, Attempt.question_id == Question.id).where(
            Attempt.student_id == student_id, Attempt.attempt_number == 1, Attempt.is_correct.is_(False)
        )
    elif filter == "missed_2nd":
        stmt = stmt.join(Attempt, Attempt.question_id == Question.id).where(
            Attempt.student_id == student_id, Attempt.attempt_number == 2, Attempt.is_correct.is_(False)
        )
    stmt = stmt.order_by(Question.sort_order, Question.id)

    questions = (await db.execute(stmt)).scalars().all()
    if not questions:
        return []

    option_rows = (
        await db.execute(select(AnswerKey).where(AnswerKey.question_id.in_([q.id for q in questions])))
    ).scalars().all()
    options_by_question: dict[UUID, list[AnswerKey]] = {}
    for o in option_rows:
        options_by_question.setdefault(o.question_id, []).append(o)

    return [await _serialize_question(q, subject, options_by_question.get(q.id, [])) for q in questions]


@router.get("/reveal", response_model=RevealOut)
async def reveal_answer(
    question_id: UUID,
    db: AsyncSession = Depends(get_db),
    student: dict = Depends(get_current_student),
):
    """Shows the correct answer for a free-response question without grading
    or recording an attempt — the student self-reports correctness afterward
    via `submit`'s `self_reported_correct` (see its docstring for why)."""
    question = await db.get(Question, question_id)
    if question is None:
        raise HTTPException(status_code=404, detail="Question not found.")
    answer_rows = (
        (await db.execute(select(AnswerKey).where(AnswerKey.question_id == question_id))).scalars().all()
    )
    return RevealOut(correct_answer=_correct_answer_text(question.question_type, answer_rows))


def _matches(question_type: str, submitted: str, correct: AnswerKey) -> bool:
    target = correct.option_label if question_type == "multiple_choice" and correct.option_label else correct.option_text
    return submitted.strip().casefold() == target.strip().casefold()


def _reset_review_queue_entry(
    review_row: ReviewQueue | None, student_id: UUID, question_id: UUID, now: datetime
) -> ReviewQueue | None:
    """Resets an existing review-queue row (or builds a new one to insert) to
    the "needs review" state. Used whenever a question's attempt sequence for
    this sitting concludes with a miss anywhere in it — a first-attempt miss
    on a non-retry-eligible question, a final wrong retry, or a retry that
    eventually landed correct (still worth flagging — see submit_answer)."""
    if review_row is not None:
        review_row.consecutive_correct = 0
        review_row.resolved = False
        review_row.last_seen_at = now
        return None
    return ReviewQueue(
        student_id=student_id, question_id=question_id, consecutive_correct=0, resolved=False, last_seen_at=now
    )


@router.post("/submit", response_model=AttemptResult)
async def submit_answer(
    payload: AttemptSubmit,
    db: AsyncSession = Depends(get_db),
    student: dict = Depends(get_current_student),
):
    if payload.student_id != student["student_id"]:
        raise HTTPException(status_code=403, detail="Cannot submit an attempt for another student.")

    student_row = await db.get(Student, payload.student_id)
    if student_row is None:
        raise HTTPException(status_code=404, detail="Student not found.")

    question = (
        await db.execute(select(Question).where(Question.id == payload.question_id))
    ).scalar_one_or_none()
    if question is None:
        raise HTTPException(status_code=404, detail="Question not found.")

    answer_rows = (
        (await db.execute(select(AnswerKey).where(AnswerKey.question_id == payload.question_id)))
        .scalars()
        .all()
    )
    correct_row = next((a for a in answer_rows if a.is_correct), None)
    if question.question_type == "free_response" and payload.self_reported_correct is not None:
        is_correct = payload.self_reported_correct
    elif question.question_type == "number_line":
        is_correct = correct_row is not None and _matches_number_line(payload.submitted_answer, correct_row.option_text)
    else:
        is_correct = correct_row is not None and _matches(question.question_type, payload.submitted_answer, correct_row)
    correct_answer = _correct_answer_text(question.question_type, answer_rows)

    prior_attempts = (
        await db.execute(
            select(func.count())
            .select_from(Attempt)
            .where(Attempt.student_id == payload.student_id, Attempt.question_id == payload.question_id)
        )
    ).scalar_one()

    prior_last_attempt_at = (
        await db.execute(select(func.max(Attempt.answered_at)).where(Attempt.student_id == payload.student_id))
    ).scalar_one()

    db.add(
        Attempt(
            student_id=payload.student_id,
            question_id=payload.question_id,
            submitted_answer=payload.submitted_answer,
            is_correct=is_correct,
            attempt_number=prior_attempts + 1,
        )
    )

    now = datetime.now(timezone.utc)

    # A wrong first attempt on an auto-graded question doesn't finalize
    # anything yet — give the student one immediate retry before scoring or
    # touching the review queue, instead of flagging on the very first miss.
    # Self-assessment questions (reveal-answer + self-report) skip this
    # entirely: there's no "retry" once the answer's already been shown.
    retry_eligible = not question.requires_self_assessment
    if not is_correct and not payload.is_retry and retry_eligible:
        _apply_streak(student_row, prior_last_attempt_at, now.date())
        await db.commit()
        return AttemptResult(
            is_correct=False,
            correct_answer=correct_answer,
            explanation=None,
            added_to_review_queue=False,
            xp_awarded=0,
            xp_total=student_row.xp_total,
            streak_days=student_row.streak_days,
            can_retry=True,
            attempt_number=1,
        )

    review_row = (
        await db.execute(
            select(ReviewQueue).where(
                ReviewQueue.student_id == payload.student_id, ReviewQueue.question_id == payload.question_id
            )
        )
    ).scalar_one_or_none()

    is_retry_conclusion = payload.is_retry and retry_eligible
    xp_awarded = 0
    added_to_review_queue = False
    if is_correct and not is_retry_conclusion:
        # Clean first-attempt correct (or a self-assessment correct, which
        # never goes through the retry path) — unchanged from before.
        xp_awarded += XP_PER_CORRECT
        if review_row is not None and not review_row.resolved:
            review_row.consecutive_correct += 1
            review_row.last_seen_at = now
            if review_row.consecutive_correct >= 2:
                review_row.resolved = True
                xp_awarded += XP_REVIEW_RESOLVED_BONUS
    else:
        # Needing a retry at all — regardless of whether the retry itself
        # lands correct — is the same "this one's shaky" signal as an
        # outright miss, so it's flagged for review the same way; a
        # retry-correct still earns half credit instead of zero.
        added_to_review_queue = True
        if is_correct:
            xp_awarded += XP_PER_CORRECT // 2
        new_row = _reset_review_queue_entry(review_row, payload.student_id, payload.question_id, now)
        if new_row is not None:
            db.add(new_row)

    student_row.xp_total += xp_awarded
    _apply_streak(student_row, prior_last_attempt_at, now.date())

    await db.commit()

    return AttemptResult(
        is_correct=is_correct,
        correct_answer=correct_answer,
        explanation=None,
        added_to_review_queue=added_to_review_queue,
        xp_awarded=xp_awarded,
        xp_total=student_row.xp_total,
        streak_days=student_row.streak_days,
        can_retry=False,
        attempt_number=2 if payload.is_retry else 1,
    )
