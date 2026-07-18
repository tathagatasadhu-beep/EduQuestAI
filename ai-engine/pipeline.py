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
    # True only for proofs/derivations/open-ended questions with no single
    # checkable answer — always False for multiple_choice, which is always
    # unambiguous. Gates the student-facing self-assessment (reveal + self-
    # report) flow vs. plain auto-grading.
    requires_self_assessment: bool = False


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

Many problems have lettered sub-parts (a, b, c, ...) that each require their own written answer — for
example "Find: AC, AB, BC" followed by "a. Find AC  b. Find AB  c. Find BC". These are NOT multiple-choice
options — the student is meant to solve and write an answer for every sub-part, not pick one. Emit each
such sub-part as its OWN SEPARATE entry in the "questions" array, never as an "options" list. Each
split-out question's "prompt_text" must restate enough of the shared given information to stand alone
(e.g. "Given a circle with center O, angle AOC = 80°, radius 9cm. Find the perimeter of the shaded
region.") plus its own specific instruction — don't just repeat the bare sub-part label. If the sub-parts
share a diagram, give every one of them the same "image_url". Reserve the "options" field for problems
that genuinely present predefined answer choices the student picks from (e.g. "A) 12  B) 14  C) 16") —
that is the only case "options" should ever hold more than one entry with real answer content.

Some worksheets include a separate, authoritative answer key — a table or list, often on its own
page(s) and sometimes appearing before any question content at all, mapping each question's number/ID
to its correct answer (e.g. rows like "1.1 ... B", "1.2 ... D"). When one is present, treat it as the
SOURCE OF TRUTH: match each question to its key entry by question number/ID, and set that option's
"is_correct" to true (all others false) instead of trying to work out or independently verify the
answer yourself. This matters most for reading-comprehension / vocabulary-in-context / opinion-based
questions, where there is no way to compute or reliably infer the intended answer the way you could for
a math problem — always defer to an explicit key when the input contains one, even if you believe a
different option looks right. Only fall back to your own judgment for questions with no matching key
entry (e.g. no key was included at all, or the worksheet doesn't have one for that specific question).

The markdown may contain image references for diagrams/figures (either markdown
`![](https://cdn.mathpix.com/...)` syntax or LaTeX `\\includegraphics{https://cdn.mathpix.com/...}`
syntax). When a question depends on a diagram (e.g. "determine which lines are parallel" next to a
figure, a geometry diagram, a graph), find the image URL that belongs to that question — usually the
one immediately preceding or embedded within it — and copy that URL verbatim into "image_url" for
that question. Use null when a question has no associated diagram. Only ever use a URL that literally
appears in the input; never invent one.

For each free-response question (never for multiple-choice, which is always unambiguous), decide
whether it has one single, definite, checkable answer — a number, an expression, a word, a short
phrase — or whether it's open-ended with no single correct string (a proof, a derivation, an
explanation, "show that...", "prove that...", "explain why..."). Set "requires_self_assessment" to
true only for the open-ended case; false for everything else, including most free-response questions
(e.g. "Solve for x: 2x+3=11" is false — it has one definite answer, "4").

"prompt_text" is the ONLY version of the question ever shown to the student — it must be clean, plain,
human-readable text with NO LaTeX commands or backslashes of any kind, even for symbols that don't have
an obvious plain-text equivalent. Convert everything to plain Unicode instead: write "π" not "\\pi", "°"
not "^\\circ", "√" not "\\sqrt", "∠ABC" not "\\angle ABC", "x²" not "x^2", and spell out notation like arcs
as plain words ("arc AC") instead of LaTeX macros like "\\overparen{AC}". Never leave a raw LaTeX command
in "prompt_text" just because a clean conversion isn't obvious — always find a plain-text or Unicode way
to express it instead.

Transcribe every passage and instructional line COMPLETELY AND VERBATIM, copying the source's actual words
in order — never summarize, shorten, paraphrase, or rewrite it in different words to save space or to make
it read more smoothly, no matter how long the passage is or how many questions the worksheet has. This
especially includes a trailing instructional line specific to that question (e.g. "Which choice completes
the text with the most logical and precise word or phrase?" or "As used in the text, what does the word
\"X\" most nearly mean?") — copy that question's own instructional line in full WHEN THE SOURCE ACTUALLY
CONTAINS ONE FOR THAT QUESTION. Never add, invent, or repeat an instructional line for a question that
doesn't have its own in the source — e.g. a vocabulary-in-context question whose source only has "As used
in the text, what does the word X most nearly mean?" must never also get "Which choice completes the
text..." tacked on; each question gets exactly the instructional line its own source text actually has,
never more, never a different one.

If the original text contains a fill-in-the-blank blank (usually shown as a run of underscores, e.g.
"______", or a LaTeX placeholder like "$\\_\\_\\_\\_$", in a "which choice completes the text" style
question), preserve it verbatim as a run of underscores in "prompt_text" — never replace it with an
ellipsis, and never simply omit it while continuing the sentence around it.

CRITICAL — never fabricate content to patch a broken source: some OCR input is itself incomplete for a
given question (the passage cuts off mid-sentence with no fill-in-the-blank marker at all, or otherwise
doesn't contain enough to actually pose the question). When that happens, do NOT invent, guess, paraphrase,
or reconstruct a plausible-sounding replacement sentence or ending — even one that would fit the answer
choices grammatically, and even though this contradicts the "transcribe completely" instruction above; an
incomplete source overrides it. Writing a made-up sentence is worse than an ellipsis, because it looks
legitimate but teaches the student something that was never in the source. Instead, simply OMIT that
question from the "questions" array entirely and move on to the next one. It is always better to return
fewer, fully genuine questions than to fill gaps with fabricated text.

When a question consists of a quoted/indented excerpt followed by a separate instructional question line
(e.g. a block-quoted passage followed by "As used in the text, what does the word ... most nearly
mean?"), put a blank line (two newline characters) between the excerpt and the instructional line in
"prompt_text" so they render as visually distinct paragraphs, matching how the original document
separates them.

The "questions" array must contain one entry for every genuinely complete question present in the input,
however many that is — don't stop early, skip, or merge complete questions just to save output length. But
per the CRITICAL rule above, "complete" is required: never pad the count by inventing content for a
question whose source text was itself incomplete.

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
      "image_url": "the cdn.mathpix.com URL for this question's diagram, verbatim, or null",
      "requires_self_assessment": true | false
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
        requires_self_assessment=bool(item.get("requires_self_assessment")),
    )


# gpt-4o's hard cap on a single response. Requesting it explicitly (instead
# of leaving max_tokens unset, which defaults much lower) avoids the model
# silently running out of room mid-JSON on worksheets with many questions.
_MAX_COMPLETION_TOKENS = 16384

# answer-key tables/headings sometimes sit on their own page, separate from
# the questions they grade — if we split the OCR text to keep a single LLM
# call's output small enough to finish, the key must stay attached to BOTH
# halves so either half can still match its questions to the right answer.
_ANSWER_KEY_HEADING = re.compile(r"answer\s*key", re.IGNORECASE)

# How many times we're willing to halve the input before giving up and
# accepting whatever the last successful call returned — bounds worst-case
# recursion for a pathologically huge worksheet.
_MAX_SPLIT_DEPTH = 4


def _split_ocr_text(text: str) -> tuple[str, str]:
    """Splits OCR markdown roughly in half at the nearest paragraph boundary
    (never mid-question), keeping any answer-key section attached to both
    halves so ID-based answer matching still works after the split."""
    key_match = _ANSWER_KEY_HEADING.search(text)
    body, key_block = (text[: key_match.start()], text[key_match.start() :]) if key_match else (text, "")

    midpoint = len(body) // 2
    boundary = body.rfind("\n\n", 0, midpoint)
    if boundary == -1:
        boundary = body.find("\n\n", midpoint)
    if boundary == -1:
        boundary = midpoint

    left, right = body[:boundary], body[boundary:]
    if key_block:
        left += "\n\n" + key_block
        right += "\n\n" + key_block
    return left, right


def _extract_questions_chunk(client: OpenAI, ocr_text: str, depth: int = 0) -> tuple[list[ExtractedQuestion], str]:
    response = client.chat.completions.create(
        model=EXTRACTION_MODEL,
        response_format={"type": "json_object"},
        max_tokens=_MAX_COMPLETION_TOKENS,
        # This is a transcription task, not a creative one — a nonzero
        # temperature is exactly what let the model "helpfully" invent a
        # plausible-sounding replacement sentence for source text that was
        # itself cut off in the OCR input (confirmed against real Mathpix
        # output: it fabricated grammatically-fitting but factually
        # different passage content rather than flagging the gap).
        temperature=0,
        messages=[
            {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
            {"role": "user", "content": ocr_text},
        ],
    )
    choice = response.choices[0]

    # finish_reason == "length" means the model's output was cut off before
    # it finished the JSON — almost always because the worksheet had more
    # questions than fit in one response. Rather than accept a truncated
    # (and possibly unparseable) result, split the input and retry each half
    # separately, so each call has a smaller worksheet to fully transcribe.
    if choice.finish_reason == "length" and depth < _MAX_SPLIT_DEPTH and len(ocr_text) > 2000:
        left, right = _split_ocr_text(ocr_text)
        left_questions, subject_guess = _extract_questions_chunk(client, left, depth + 1)
        right_questions, _ = _extract_questions_chunk(client, right, depth + 1)
        return left_questions + right_questions, subject_guess

    raw = json.loads(choice.message.content)
    questions = [_parse_question(item) for item in raw["questions"]]
    subject_guess = (raw.get("subject_guess") or "General").strip()
    return questions, subject_guess


def extract_questions(ocr_text: str) -> ExtractionResult:
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is not configured.")

    client = OpenAI(api_key=OPENAI_API_KEY)
    questions, subject_guess = _extract_questions_chunk(client, ocr_text)
    return ExtractionResult(subject_guess=subject_guess, questions=questions, ocr_text=ocr_text)


def run_pipeline(pdf_bytes: bytes, filename: str) -> ExtractionResult:
    """Entry point called by the background job triggered from pdfs.upload_pdf."""
    ocr_text = ocr_pdf(pdf_bytes, filename)
    result = extract_questions(ocr_text)
    result.images = _download_images(_extract_image_urls(ocr_text))
    return result
