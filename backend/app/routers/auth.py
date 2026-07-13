"""
Auth router — real implementation.

Parents: Supabase Auth handles email/password (signup, login, password
storage). We mirror the resulting auth user into our own `users` table so the
rest of the app can join on it, and every other router scopes its queries by
that same id via `get_current_parent_id`.

Students: no email/password. A parent-generated login code (see
students.py::create_student) maps to a short-lived, first-party JWT minted
here — scoped to just that student_id + parent_user_id, nothing else.
"""
import hashlib
import os
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException
from gotrue.errors import AuthApiError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_student_token, decode_student_token, decode_supabase_jwt
from app.core.supabase_client import get_supabase
from app.db.orm import Student, User
from app.db.session import get_db
from app.models.schemas import (
    AuthToken,
    ForgotPasswordRequest,
    ParentLogin,
    ParentOut,
    ParentSignup,
    StudentAuthToken,
    StudentLoginRequest,
    StudentOut,
)

FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")

router = APIRouter()


def get_current_parent_id(authorization: str | None = Header(default=None)) -> UUID:
    """Every parent-facing route depends on this — decodes the Supabase
    access token the frontend sends as `Authorization: Bearer <token>`."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token.")
    claims = decode_supabase_jwt(authorization.split(" ", 1)[1])
    return UUID(claims["sub"])


def get_current_student(authorization: str | None = Header(default=None)) -> dict:
    """Student-facing routes (quiz, review queue) depend on this instead."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token.")
    claims = decode_student_token(authorization.split(" ", 1)[1])
    return {"student_id": UUID(claims["sub"]), "parent_user_id": UUID(claims["parent_user_id"])}


@router.post("/parent/signup", response_model=AuthToken)
async def parent_signup(payload: ParentSignup, db: AsyncSession = Depends(get_db)):
    supabase = get_supabase()
    try:
        result = supabase.auth.sign_up(
            {
                "email": payload.email,
                "password": payload.password,
                "options": {"data": {"full_name": payload.full_name}},
            }
        )
    except AuthApiError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if result.user is None:
        raise HTTPException(status_code=400, detail="Signup failed.")

    parent_id = UUID(result.user.id)
    existing = await db.execute(select(User).where(User.id == parent_id))
    user = existing.scalar_one_or_none()
    if user is None:
        user = User(id=parent_id, email=payload.email, full_name=payload.full_name)
        db.add(user)
        await db.commit()

    if result.session is None:
        raise HTTPException(
            status_code=202,
            detail="Signup succeeded — check your email to confirm your account, then log in.",
        )

    return AuthToken(
        access_token=result.session.access_token,
        user=ParentOut(id=user.id, email=user.email, full_name=user.full_name),
    )


@router.post("/parent/login", response_model=AuthToken)
async def parent_login(payload: ParentLogin, db: AsyncSession = Depends(get_db)):
    supabase = get_supabase()
    try:
        result = supabase.auth.sign_in_with_password({"email": payload.email, "password": payload.password})
    except AuthApiError as exc:
        raise HTTPException(status_code=401, detail="Invalid email or password.") from exc

    parent_id = UUID(result.user.id)
    row = await db.execute(select(User).where(User.id == parent_id))
    user = row.scalar_one_or_none()
    if user is None:
        # Confirmed their email and is logging in for the first time — backfill the profile row.
        full_name = (result.user.user_metadata or {}).get("full_name", "")
        user = User(id=parent_id, email=result.user.email, full_name=full_name)
        db.add(user)
        await db.commit()

    return AuthToken(
        access_token=result.session.access_token,
        user=ParentOut(id=user.id, email=user.email, full_name=user.full_name),
    )


@router.post("/parent/forgot-password", status_code=202)
async def forgot_password(payload: ForgotPasswordRequest):
    """Always responds 202 regardless of whether the email exists, so this
    endpoint can't be used to enumerate registered accounts. Supabase emails
    a recovery link to `{FRONTEND_URL}/parent/reset-password`, which the
    frontend handles client-side (see that page for why)."""
    supabase = get_supabase()
    try:
        supabase.auth.reset_password_for_email(
            payload.email, {"redirect_to": f"{FRONTEND_URL}/parent/reset-password"}
        )
    except AuthApiError:
        pass
    return {"detail": "If that email is registered, a reset link has been sent."}


@router.post("/student/login-code", response_model=StudentAuthToken)
async def student_login(payload: StudentLoginRequest, db: AsyncSession = Depends(get_db)):
    code_hash = hashlib.sha256(payload.code.strip().lower().encode()).hexdigest()
    result = await db.execute(select(Student).where(Student.login_code_hash == code_hash))
    student = result.scalar_one_or_none()
    if student is None:
        raise HTTPException(status_code=401, detail="Invalid login code.")
    if student.login_code_expires_at and student.login_code_expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="This code has expired — ask a parent to generate a new one.")

    token = create_student_token(str(student.id), str(student.parent_user_id))
    return StudentAuthToken(
        access_token=token,
        student=StudentOut(
            id=student.id,
            display_name=student.display_name,
            grade_level=student.grade_level,
            xp_total=student.xp_total,
            streak_days=student.streak_days,
        ),
    )
