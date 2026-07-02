"""
Pydantic request/response models, mirroring database/migrations/001_init.sql.
Swap in an ORM (SQLAlchemy models) as the DB layer is implemented — these stay
as the API-facing contracts either way.
"""
from datetime import datetime
from typing import Optional, Literal
from uuid import UUID
from pydantic import BaseModel, EmailStr


class ParentSignup(BaseModel):
    email: EmailStr
    full_name: str
    password: str


class StudentCreate(BaseModel):
    display_name: str
    grade_level: Optional[str] = None


class StudentOut(BaseModel):
    id: UUID
    display_name: str
    grade_level: Optional[str]
    xp_total: int
    streak_days: int


class Topic(BaseModel):
    id: UUID
    subject_id: UUID
    name: str


class QuestionOut(BaseModel):
    id: UUID
    topic_id: UUID
    prompt_text: str
    prompt_latex: Optional[str] = None
    image_path: Optional[str] = None
    difficulty: Literal["easy", "medium", "hard"]
    question_type: Literal["multiple_choice", "free_response"]
    options: list[dict] = []  # [{option_label, option_text}] — is_correct withheld client-side


class AttemptSubmit(BaseModel):
    student_id: UUID
    question_id: UUID
    submitted_answer: str


class AttemptResult(BaseModel):
    is_correct: bool
    correct_answer: str
    explanation: Optional[str] = None
    added_to_review_queue: bool


class MasteryStat(BaseModel):
    topic_id: UUID
    topic_name: str
    accuracy_rate: float  # (correct first attempts / total first attempts) * 100
    total_first_attempts: int


class PdfUploadOut(BaseModel):
    id: UUID
    status: Literal["pending", "processing", "extracted", "failed"]
    original_name: str
