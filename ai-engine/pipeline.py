"""
EduQuestAI ingestion pipeline — real implementation.

Flow:
  1. OCR the uploaded worksheet PDF via Mathpix's async PDF API (submit ->
     poll -> fetch markdown), which returns math-aware text/LaTeX instead of
     garbled OCR of fractions/exponents. Mathpix also detects and crops any
     diagrams/figures on the page, inlining them into that same markdown as
     image references (`![]()` or LaTeX `\\includegraphics{}`) pointing at
     temporary `cdn.mathpix.com` URLs — those get pulled out and downloaded
     immediately (see `_extract_image_urls`/`_download_images`) since the
     source retention window is only ~30 days, too short to rely on for a
     student answering the same worksheet months later.
  2. Feed the OCR markdown to an LLM (OpenAI) with a structured-output prompt
     that splits it into discrete questions, matches each to its answer key,
     tags a topic name + difficulty, and best-effort matches each question to
     one of the image URLs found in step 1, if any.
  3. The caller (pdfs.py's background task) writes the returned questions
     into `questions`/`answer_keys`, re-uploads any matched image bytes to
     permanent storage, and updates `pdfs.status`.

Requires MATHPIX_APP_ID/MATHPIX_APP_KEY and OPENAI_API_KEY to be set — see
.env.example. This module makes real network calls; there's no offline mode.
"""
import json
import os
import re
import time
from dataclasses import dataclass, field

import httpx
from openai import OpenAI

MATHPIX_APP_ID = os.environ.get("MATHPIX_APP_ID", "")
MATHPIX_APP_KEY = os.environ.get("MATHPIX_APP_KEY", "")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
EXTRACTION_MODEL = os.environ.get("OPENAI_EXTRACTION_MODEL", "gpt-4o")

MATHPIX_POLL_INTERVAL_SECONDS = 3
MATHPIX_POLL_TIMEOUT_SECONDS = 180

# Matches both markdown image syntax and Mathpix's LaTeX figure syntax, e.g.:
#   ![](https://cdn.mathpix.com/cropped/abc123.jpg)
#   \includegraphics[width=0.5\textwidth]{https://cdn.mathpix.com/cropped/abc123.jpg}
_IMAGE_MD_PATTERN = re.compile(r"!\[[^\]]*\]\((https://cdn\.mathpix\.com/[^\s)]+)\)")
_IMAGE_LATEX_PATTERN = re.compile(r"\\includegraphics(?:\[[^\]]*\])?\{(https://cdn\.mathpix\.com/[^\s}]+)\}")


@dataclass
class ExtractedQuestion:
    prompt_text: str
    prompt_latex: str | None
    options: list[dict]  # [{"label": "A" | None, "text": "...", "is_correct": bool}]
    topic_guess: str
    difficulty_guess: str  # "easy" | "medium" | "hard"
    image_url: str | None = None  # a key into ExtractionResult.images, if this question has a diagram


@dataclass
class ExtractionResult:
    subject_guess: str  # document-level — one worksheet is assumed to belong to one subject
    questions: list[ExtractedQuestion]
    ocr_text: str  # raw Mathpix markdown — persisted so the AI tutor can ground answers in it
    images: dict[str, bytes] = field(default_factory=dict)  # cdn.mathpix.com url -> downloaded bytes


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


def _extract_image_urls(markdown: str) -> list[str]:
    """Every cdn.mathpix.com image reference in the OCR'd markdown, in the
    order they appear, de-duplicated. Covers both plain markdown image syntax
    and Mathpix's LaTeX `\\includegraphics{}` figure syntax."""
    urls = _IMAGE_MD_PATTERN.findall(markdown) + _IMAGE_LATEX_PATTERN.findall(markdown)
    seen: set[str] = set()
    ordered: list[str] = []
    for url in urls:
        if url not in seen:
            seen.add(url)
            ordered.append(url)
    return ordered


def _download_images(urls: list[str]) -> dict[str, bytes]:
    """Downloads each detected diagram immediately, while Mathpix's result is
    still fresh — its cropped-image URLs are only retained for ~30 days, too
    short-lived to store directly on a Question a student might see months
    later. A single failed download is skipped rather than failing the whole
    worksheet."""
    if not urls:
        return {}
    images: dict[str, bytes] = {}
    with httpx.Client(timeout=30) as client:
        for url in urls:
            try:
                resp = client.get(url)
                resp.raise_for_status()
                images[url] = resp.content
            except Exception:
                continue
    return images


EXTRACTION_SYSTEM_PROMPT = """You are an exam-parsing engine. Given raw OCR'd markdown from a
math/science worksheet, first identify the overall subject/course the worksheet belongs to
(e.g. "AP Calculus", "SAT Math", "Grade 8 Algebra" — short, matching how a course would be
named in a school catalog), then split the content into individual questions.

The markdown may contain image references for diagrams/figures (either markdown
`![](https://cdn.mathpix.com/...)` syntax or LaTeX `\\includegraphics{https://cdn.mathpix.com/...}`
syntax). When a question depends on a diagram (e.g. "determine which lines are parallel" next to a
figure, a geometry diagram, a graph), find the image URL that belongs to that question — usually the
one immediately preceding or embedded within it — and copy that URL verbatim into "image_url" for
that question. Use null when a question has no associated diagram. Only ever use a URL that literally
appears in the input; never invent one.

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
      "difficulty_guess": "easy" | "medium" | "hard",
      "image_url": "the cdn.mathpix.com URL for this question's diagram, verbatim, or null"
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
        image_url=item.get("image_url"),
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
    return ExtractionResult(subject_guess=subject_guess, questions=questions, ocr_text=ocr_text)


def run_pipeline(pdf_bytes: bytes, filename: str) -> ExtractionResult:
    """Entry point called by the background job triggered from pdfs.upload_pdf."""
    ocr_text = ocr_pdf(pdf_bytes, filename)
    result = extract_questions(ocr_text)
    result.images = _download_images(_extract_image_urls(ocr_text))
    return result
