"""
EduQuestAI backend entrypoint.

Run locally:
    uvicorn app.main:app --reload --port 8000

This wires up the router modules. Each router is a stub — see the TODOs inside
for where to plug in real Supabase auth, Postgres queries (via SQLAlchemy or
asyncpg), and the AI ingestion pipeline.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import auth, students, subjects, pdfs, quiz, review_queue

app = FastAPI(
    title="EduQuestAI API",
    version="0.1.0",
    description="Backend for the EduQuestAI adaptive learning platform.",
)

# TODO: restrict allow_origins to the deployed frontend domain(s) before production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(students.router, prefix="/api/students", tags=["students"])
app.include_router(subjects.router, prefix="/api/subjects", tags=["subjects"])
app.include_router(pdfs.router, prefix="/api/pdfs", tags=["pdfs"])
app.include_router(quiz.router, prefix="/api/quiz", tags=["quiz"])
app.include_router(review_queue.router, prefix="/api/review-queue", tags=["review-queue"])


@app.get("/api/health")
def health():
    return {"status": "ok"}
