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


class ParentLogin(BaseModel):
    email: EmailStr
    password: str


class ParentOut(BaseModel):
    id: UUID
    email: EmailStr
    full_name: str


class AuthToken(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: ParentOut


class StudentLoginRequest(BaseModel):
    code: str


class StudentCreate(BaseModel):
    display_name: str
    grade_level: Optional[str] = None


class StudentUpdate(BaseModel):
    display_name: Optional[str] = None
    grade_level: Optional[str] = None


class LoginCodeOut(BaseModel):
    login_code: str


class StudentOut(BaseModel):
    id: UUID
    display_name: str
    grade_level: Optional[str]
    xp_total: int
    streak_days: int


class StudentCreateOut(StudentOut):
    login_code: str  # plaintext code, only ever returned here — give it to the child


class StudentAuthToken(BaseModel):
    access_token: str
    token_type: str = "bearer"
    student: StudentOut


class SubjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    grade_level: Optional[str] = None


class SubjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    grade_level: Optional[str] = None


class SubjectOut(BaseModel):
    id: UUID
    name: str
    description: Optional[str] = None
    grade_level: Optional[str] = None
    sort_order: int = 0


class ReorderItem(BaseModel):
    id: UUID
    sort_order: int


class Topic(BaseModel):
    id: UUID
    subject_id: UUID
    name: str
    sort_order: int = 0


class TopicCreate(BaseModel):
    name: str


class TopicUpdate(BaseModel):
    name: str


class QuestionOut(BaseModel):
    id: UUID
    topic_id: UUID
    subject_id: UUID
    subject_name: str
    prompt_text: str
    prompt_latex: Optional[str] = None
    image_path: Optional[str] = None
    difficulty: Optional[Literal["easy", "medium", "hard"]] = None
    question_type: Literal["multiple_choice", "free_response"]
    options: list[dict] = []  # [{option_label, option_text}] — is_correct withheld client-side
    # True only for proof/open-ended free-response questions with no single
    # checkable answer — gates the reveal+self-report flow vs. plain
    # auto-grading on the frontend. Always False for multiple_choice.
    requires_self_assessment: bool = False


class RevealOut(BaseModel):
    correct_answer: str


class AttemptSubmit(BaseModel):
    student_id: UUID
    question_id: UUID
    submitted_answer: str
    # Free-response only — see quiz.py::submit_answer. When set, this becomes
    # `is_correct` directly instead of the exact-string match in `_matches`,
    # since free-response answers (e.g. proofs) often have no single correct
    # string. Ignored for multiple_choice, which stays auto-graded.
    self_reported_correct: Optional[bool] = None


class AttemptResult(BaseModel):
    is_correct: bool
    correct_answer: str
    explanation: Optional[str] = None
    added_to_review_queue: bool
    xp_awarded: int = 0
    xp_total: int
    streak_days: int


class MasteryStat(BaseModel):
    topic_id: UUID
    topic_name: str
    accuracy_rate: float  # (correct first attempts / total first attempts) * 100
    total_first_attempts: int


class PdfUploadOut(BaseModel):
    id: UUID
    status: Literal["pending", "processing", "extracted", "failed"]
    original_name: str
    content_type: Literal["theory", "practice"] = "practice"
    error_message: Optional[str] = None


class PdfUploadUrlRequest(BaseModel):
    filename: str
    subject_id: Optional[UUID] = None
    topic_id: Optional[UUID] = None
    content_type: Literal["theory", "practice"] = "practice"


class PdfUploadUrlOut(BaseModel):
    pdf_id: UUID
    upload_url: str


class PdfTopicOut(BaseModel):
    id: UUID
    name: str


class PdfOut(BaseModel):
    id: UUID
    original_name: str
    status: Literal["pending", "processing", "extracted", "failed"]
    error_message: Optional[str] = None
    content_type: Literal["theory", "practice"]
    subject_id: Optional[UUID] = None
    subject_name: Optional[str] = None
    question_count: int
    uploaded_at: datetime
    topics: list[PdfTopicOut] = []


class PdfUpdate(BaseModel):
    content_type: Literal["theory", "practice"]
    # Manually tags this PDF with a topic — the only way to give a theory
    # PDF a topic at all, since it produces no extracted questions and
    # therefore no question-derived topic link. Left untouched when omitted.
    topic_id: Optional[UUID] = None


class TheoryPdfOut(BaseModel):
    id: UUID
    original_name: str
    uploaded_at: datetime
    # A short-lived Supabase Storage signed URL — fetch this endpoint again
    # once it expires rather than caching the link.
    url: str


class AssignmentCreate(BaseModel):
    subject_id: UUID
    topic_id: Optional[UUID] = None


class AssignmentOut(BaseModel):
    id: UUID
    subject_id: UUID
    subject_name: str
    topic_id: Optional[UUID] = None
    topic_name: Optional[str] = None
    created_at: datetime


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class AssignedTopicOut(BaseModel):
    id: UUID
    name: str
    sort_order: int = 0


class AssignedSubjectOut(BaseModel):
    id: UUID
    name: str
    grade_level: Optional[str] = None
    topics: list[AssignedTopicOut]


class BadgeOut(BaseModel):
    id: str
    name: str
    description: str
    earned: bool


class TutorChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class TutorChatRequest(BaseModel):
    subject_id: UUID
    message: str
    history: list[TutorChatMessage] = []


class TutorChatResponse(BaseModel):
    reply: str
