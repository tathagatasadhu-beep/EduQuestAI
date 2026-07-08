"""
EduQuestAI ingestion pipeline — real implementation.

Flow:
  1. OCR the uploaded worksheet PDF via Mathpix's async PDF API (submit ->
     poll -> fetch markdown), which returns math-aware text/LaTeX instead of
     garbled OCR of fractions/exponents.
  2. Feed the OCR markdown to an LLM (OpenAI) with a structured-output prompt
     that splits it into discrete questions, matches each to its answer key,
     and tags a topic name + difficulty.
  3. The caller (pdfs.py's background task) writes the returned questions
     into `questions`/`answer_keys` and updates `pdfs.status`.

Requires MATHPIX_APP_ID/MATHPIX_APP_KEY and OPENAI_API_KEY to be set — see
.env.example. This module makes real network calls; there's no offline mode.
"""
import json
import os
import time
from dataclasses import dataclass

import httpx
from openai import OpenAI

MATHPIX_APP_ID = os.environ.get("MATHPIX_APP_ID", "")
MATHPIX_APP_KEY = os.environ.get("MATHPIX_APP_KEY", "")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
EXTRACTION_MODEL = os.environ.get("OPENAI_EXTRACTION_MODEL", "gpt-4o")

MATHPIX_POLL_INTERVAL_SECONDS = 3
MATHPIX_POLL_TIMEOUT_SECONDS = 180


@dataclass
class ExtractedQuestion:
    prompt_text: str
    prompt_latex: str | None
    options: list[dict]  # [{"label": "A" | None, "text": "...", "is_correct": bool}]
    topic_guess: str
    difficulty_guess: str  # "easy" | "medium" | "hard"


@dataclass
class ExtractionResult:
    subject_guess: str  # document-level — one worksheet is assumed to belong to one subject
    questions: list[ExtractedQuestion]


def ocr_pdf(pdf_bytes: bytes, filename: str) -> str:
    """Submit the PDF to Mathpix's async PDF API, poll until done, return the markdown."""
    if not MATHPIX_APP_ID or not MATHPIX_APP_KEY:
        raise RuntimeError("MATHPIX_APP_ID / MATHPIX_APP_KEY are not configured.")

    auth_headers = {"app_id": MATHPIX_APP_ID, "app_key": MATHPIX_APP_KEY}

    with httpx.Client(timeout=60) as client:
        submit = client.post(
            "https://api.mathpix.com/v3/pdf",
            headers=auth_headers,
            files={"file": (filename, pdf_bytes, "application/pdf")},
            data={"options_json": json.dumps({"conversion_formats": {"md": True}})},
        )
        submit.raise_for_status()
        mathpix_pdf_id = submit.json()["pdf_id"]

        deadline = time.monotonic() + MATHPIX_POLL_TIMEOUT_SECONDS
        status = None
        while time.monotonic() < deadline:
            status_resp = client.get(f"https://api.mathpix.com/v3/pdf/{mathpix_pdf_id}", headers=auth_headers)
            status_resp.raise_for_status()
            status = status_resp.json().get("status")
            if status == "completed":
                break
            if status == "error":
                raise RuntimeError(f"Mathpix OCR failed: {status_resp.json()}")
            time.sleep(MATHPIX_POLL_INTERVAL_SECONDS)
        else:
            raise TimeoutError(f"Mathpix OCR did not complete in time (last status: {status}).")

        md_resp = client.get(f"https://api.mathpix.com/v3/pdf/{mathpix_pdf_id}.md", headers=auth_headers)
        md_resp.raise_for_status()
        return md_resp.text


EXTRACTION_SYSTEM_PROMPT = """You are an exam-parsing engine. Given raw OCR'd markdown from a
math/science worksheet, first identify the overall subject/course the worksheet belongs to
(e.g. "AP Calculus", "SAT Math", "Grade 8 Algebra" — short, matching how a course would be
named in a school catalog), then split the content into individual questions.

Respond with a JSON object of exactly this shape, no prose, no markdown fences:
{
  "subject_guess": "short subject/course name for the whole worksheet",
  "questions": [
    {
      "prompt_text": "plain-text version of the question",
      "prompt_latex": "LaTeX version if it contains math, else null",
      "options": [
        {"label": "A", "text": "option text", "is_correct": true},
        {"label": "B", "text": "option text", "is_correct": false}
      ],
      "topic_guess": "short topic name, e.g. 'Related Rates'",
      "difficulty_guess": "easy" | "medium" | "hard"
    }
  ]
}

For free-response questions (no multiple-choice options), return a single option
with "label": null and "text" set to the accepted answer."""


def _parse_question(item: dict) -> ExtractedQuestion:
    return ExtractedQuestion(
        prompt_text=item["prompt_text"],
        prompt_latex=item.get("prompt_latex"),
        options=item.get("options", []),
        topic_guess=item.get("topic_guess") or "General",
        difficulty_guess=item.get("difficulty_guess") or "medium",
    )


def extract_questions(ocr_text: str) -> ExtractionResult:
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is not configured.")

    client = OpenAI(api_key=OPENAI_API_KEY)
    response = client.chat.completions.create(
        model=EXTRACTION_MODEL,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
            {"role": "user", "content": ocr_text},
        ],
    )
    raw = json.loads(response.choices[0].message.content)
    questions = [_parse_question(item) for item in raw["questions"]]
    subject_guess = (raw.get("subject_guess") or "General").strip()
    return ExtractionResult(subject_guess=subject_guess, questions=questions)


def run_pipeline(pdf_bytes: bytes, filename: str) -> ExtractionResult:
    """Entry point called by the background job triggered from pdfs.upload_pdf."""
    ocr_text = ocr_pdf(pdf_bytes, filename)
    return extract_questions(ocr_text)
