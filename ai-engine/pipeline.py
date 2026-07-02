"""
EduQuestAI ingestion pipeline — STUB.

Intended flow (per spec Phase 2):
  1. OCR the uploaded worksheet PDF with a math-aware OCR engine (Mathpix API
     or a self-hosted Nougat model) so fractions/inequalities/exponents come
     out as clean text/LaTeX instead of garbled Unicode.
  2. Feed the OCR dump to an LLM (OpenAI) with a structured-output prompt that
     splits it into discrete questions, matches each to its answer key, and
     tags Subject / Topic / difficulty.
  3. Write rows into `questions` and `answer_keys`, update `pdfs.status`.

This file intentionally does NOT call any real API — wire in your Mathpix/
Nougat and OpenAI credentials and replace the two TODO functions below.
"""
import json
from dataclasses import dataclass


@dataclass
class ExtractedQuestion:
    prompt_text: str
    prompt_latex: str | None
    options: list[dict]          # [{"label": "A", "text": "...", "is_correct": bool}]
    topic_guess: str
    difficulty_guess: str         # "easy" | "medium" | "hard"


def ocr_pdf(pdf_path: str) -> str:
    """
    TODO: call Mathpix (https://docs.mathpix.com) or a hosted Nougat instance.
    Return the raw OCR text/LaTeX dump for the whole document.
    """
    raise NotImplementedError("Wire up Mathpix or Nougat here.")


EXTRACTION_SYSTEM_PROMPT = """You are an exam-parsing engine. Given raw OCR'd text
from a math/science worksheet, split it into individual questions. For each
question return: prompt_text, prompt_latex (if it contains math), multiple
choice options with the correct one flagged, a best-guess topic name, and a
difficulty estimate (easy/medium/hard). Respond ONLY with a JSON array, no
prose, no markdown fences."""


def extract_questions(ocr_text: str) -> list[ExtractedQuestion]:
    """
    TODO: call the OpenAI API (see anthropic_api_in_artifacts-style pattern,
    or the OpenAI SDK directly) with EXTRACTION_SYSTEM_PROMPT + ocr_text,
    parse the JSON response, and map it into ExtractedQuestion objects.

    Example shape once wired up:

        response = openai_client.chat.completions.create(
            model="gpt-4.1",
            messages=[
                {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
                {"role": "user", "content": ocr_text},
            ],
        )
        raw = json.loads(response.choices[0].message.content)
        return [ExtractedQuestion(**item) for item in raw]
    """
    raise NotImplementedError("Wire up the OpenAI extraction call here.")


def run_pipeline(pdf_path: str) -> list[ExtractedQuestion]:
    """Entry point called by the background job triggered from pdfs.upload_pdf."""
    ocr_text = ocr_pdf(pdf_path)
    return extract_questions(ocr_text)
