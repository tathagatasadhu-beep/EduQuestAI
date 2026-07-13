"""
AI tutor chat — real implementation.

Grounds answers in the subject's theory PDFs (`Pdf.ocr_text`, persisted by the ingestion
pipeline — see ai-engine/pipeline.py), falling back to live web search only when the
worksheets don't cover the question. Conversation history is round-tripped from the client
each turn — there's no server-side chat storage (see CLAUDE.md's Phase 2 notes for why).
"""
import os
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from openai import OpenAI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.orm import Pdf, Subject, Topic
from app.db.session import get_db
from app.models.schemas import TutorChatRequest, TutorChatResponse
from app.routers.auth import get_current_student

router = APIRouter()

CHAT_MODEL = os.environ.get("OPENAI_CHAT_MODEL", "gpt-4o")
CONTEXT_CHAR_BUDGET = 12_000

SYSTEM_PROMPT = """You are a friendly, encouraging AI tutor helping a student understand a \
school subject. Below is excerpted content from their parent's uploaded worksheets for this \
subject — treat it as the primary, authoritative source. Answer from it whenever it covers \
the question.

Only search the web when the worksheet excerpts don't cover what the student is asking, or \
when they explicitly ask for a simpler explanation or another example beyond what's provided. \
When you do use the web, prefer well-established, reliable sources.

Keep answers short, warm, and age-appropriate — you're talking to a student, not writing a \
textbook. Use simple language and concrete examples."""


@router.post("/chat", response_model=TutorChatResponse)
async def chat(
    payload: TutorChatRequest,
    db: AsyncSession = Depends(get_db),
    student: dict = Depends(get_current_student),
):
    subject = await db.get(Subject, payload.subject_id)
    if subject is None:
        raise HTTPException(status_code=404, detail="Subject not found.")

    theory_pdfs = (
        await db.execute(
            select(Pdf).where(
                Pdf.subject_id == payload.subject_id,
                Pdf.content_type == "theory",
                Pdf.deleted_at.is_(None),
                Pdf.ocr_text.is_not(None),
            )
        )
    ).scalars().all()

    context_parts = []
    remaining = CONTEXT_CHAR_BUDGET
    for pdf in theory_pdfs:
        if remaining <= 0:
            break
        chunk = pdf.ocr_text[:remaining]
        context_parts.append(f"--- {pdf.original_name} ---\n{chunk}")
        remaining -= len(chunk)
    worksheet_context = "\n\n".join(context_parts) if context_parts else "(No theory worksheets uploaded for this subject yet.)"

    topics = (
        await db.execute(select(Topic.name).where(Topic.subject_id == payload.subject_id))
    ).scalars().all()
    topic_list = ", ".join(topics) if topics else "(no topics yet)"

    system_content = (
        f"{SYSTEM_PROMPT}\n\nSubject: {subject.name}\nTopics in this subject: {topic_list}\n\n"
        f"Worksheet excerpts:\n{worksheet_context}"
    )

    input_messages = [{"role": "system", "content": system_content}]
    for msg in payload.history:
        input_messages.append({"role": msg.role, "content": msg.content})
    input_messages.append({"role": "user", "content": payload.message})

    client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    response = client.responses.create(
        model=CHAT_MODEL,
        input=input_messages,
        tools=[{"type": "web_search"}],
    )

    return TutorChatResponse(reply=response.output_text)
