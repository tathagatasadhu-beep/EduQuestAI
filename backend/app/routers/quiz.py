"""
Quiz engine router — STUB.
TODO: implement session flow (next question for a topic, given the student's
review-queue and mastery state), submit-answer scoring, and review-queue
insertion on incorrect answers.
"""
from fastapi import APIRouter
from app.models.schemas import AttemptSubmit, AttemptResult, QuestionOut

router = APIRouter()


@router.get("/next-question", response_model=QuestionOut)
def next_question(student_id: str, topic_id: str):
    # TODO: prioritize due review-queue items before new questions.
    ...


@router.post("/submit", response_model=AttemptResult)
def submit_answer(payload: AttemptSubmit):
    # TODO:
    #  1. look up correct answer_keys row for the question
    #  2. insert into attempts (attempt_number based on prior attempts for this student+question)
    #  3. if incorrect -> upsert into review_queue (reset consecutive_correct to 0)
    #  4. if correct AND was in review_queue -> increment consecutive_correct;
    #     mark resolved=true once consecutive_correct hits 2 (across different sessions)
    ...
