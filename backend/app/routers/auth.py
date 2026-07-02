"""
Auth router — STUB.
TODO: replace with real Supabase Auth (parent sign-up/login via email) and a
restricted student login-code flow (short-lived code -> scoped JWT with
student_id + parent_user_id claims, no email/password for kids).
"""
from fastapi import APIRouter, HTTPException
from app.models.schemas import ParentSignup

router = APIRouter()


@router.post("/parent/signup")
def parent_signup(payload: ParentSignup):
    raise HTTPException(status_code=501, detail="Not implemented — wire up Supabase Auth here.")


@router.post("/student/login-code")
def student_login(code: str):
    raise HTTPException(status_code=501, detail="Not implemented — wire up student login-code flow.")
