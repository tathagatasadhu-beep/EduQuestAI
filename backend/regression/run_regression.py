"""
Regression check for the PDF extraction pipeline (ai-engine/pipeline.py).

Runs extraction against cached OCR fixtures for each reference worksheet and
checks the result against known failure signatures already confirmed on real
production data: dropped/duplicated questions, orphaned images, raw LaTeX
leaking into prompt_text, duplicate options within one question. The OCR
text itself is cached (see fixtures/README.md) so each run only re-pays for
the OpenAI extraction call, not Mathpix/Document AI.

The OpenAI call itself is ALSO cached (backend/regression/.cache/, gitignored)
keyed on the OCR text plus everything that can change what gets sent to the
model (model name, the extraction prompt, chunk-size threshold, chunk-
boundary-safety logic). This means iterating on anything downstream of
extraction -- _merge_question_lists, _dedupe_merged_questions,
_is_likely_duplicate -- costs nothing on the 2nd+ run, since none of those
change the fingerprint. Editing the prompt, the model, or the chunking logic
correctly busts the cache and re-pays for a fresh call. Pass --no-cache (or
set REGRESSION_NO_CACHE=1) to force fresh calls anyway, e.g. for a final
check right before shipping.

Usage:
    backend/venv/Scripts/python.exe backend/regression/run_regression.py [--no-cache]
"""
import dataclasses
import hashlib
import inspect
import json
import os
import re
import sys
from pathlib import Path

REGRESSION_DIR = Path(__file__).parent
FIXTURES_DIR = REGRESSION_DIR / "fixtures"
CACHE_DIR = REGRESSION_DIR / ".cache"
BACKEND_DIR = REGRESSION_DIR.parent
AI_ENGINE_DIR = BACKEND_DIR.parent / "ai-engine"

sys.path.insert(0, str(AI_ENGINE_DIR))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(BACKEND_DIR / ".env")

import pipeline  # noqa: E402
from openai import OpenAI  # noqa: E402

_LATEX_COMMAND_PATTERN = re.compile(r"\\[a-zA-Z]+")

USE_CACHE = "--no-cache" not in sys.argv and not os.environ.get("REGRESSION_NO_CACHE")


def _extraction_fingerprint() -> str:
    """Hash of everything that determines what _extract_one_source actually
    sends to/gets back from the model -- so the cache below invalidates
    whenever the prompt, model, or chunking logic changes, but stays valid
    when only downstream merge/dedup code changes."""
    parts = [
        pipeline.EXTRACTION_MODEL,
        pipeline.EXTRACTION_SYSTEM_PROMPT,
        str(pipeline._PROACTIVE_CHUNK_THRESHOLD),
        inspect.getsource(pipeline._split_ocr_text),
        inspect.getsource(pipeline._extract_questions_chunk),
    ]
    return hashlib.sha256("\n".join(parts).encode("utf-8")).hexdigest()[:16]


def _cached_extract_one_source(client: OpenAI, text: str) -> tuple[list, str]:
    if not USE_CACHE:
        return pipeline._extract_one_source(client, text)

    CACHE_DIR.mkdir(exist_ok=True)
    key = hashlib.sha256((text + _extraction_fingerprint()).encode("utf-8")).hexdigest()
    cache_path = CACHE_DIR / f"{key}.json"
    if cache_path.exists():
        data = json.loads(cache_path.read_text(encoding="utf-8"))
        questions = [pipeline.ExtractedQuestion(**q) for q in data["questions"]]
        return questions, data["subject_guess"]

    questions, subject_guess = pipeline._extract_one_source(client, text)
    cache_path.write_text(
        json.dumps({
            "subject_guess": subject_guess,
            "questions": [dataclasses.asdict(q) for q in questions],
        }),
        encoding="utf-8",
    )
    return questions, subject_guess


def _extract_questions_cached(ocr_text: str, secondary_ocr_text: str | None) -> pipeline.ExtractionResult:
    """Mirrors pipeline.extract_questions() but routes the per-source
    extraction call through the disk cache above."""
    client = OpenAI(api_key=pipeline.OPENAI_API_KEY)
    primary_questions, subject_guess = _cached_extract_one_source(client, ocr_text)
    questions = primary_questions
    if secondary_ocr_text:
        secondary_questions, _ = _cached_extract_one_source(client, secondary_ocr_text)
        questions = pipeline._dedupe_merged_questions(
            pipeline._merge_question_lists(primary_questions, secondary_questions)
        )
    return pipeline.ExtractionResult(subject_guess=subject_guess, questions=questions, ocr_text=ocr_text)


def check_fixture(manifest: dict) -> list[str]:
    """Returns a list of failure messages; empty means the fixture passed."""
    failures = []
    mathpix_text = (FIXTURES_DIR / manifest["mathpix_file"]).read_text(encoding="utf-8")
    docai_text = None
    if manifest.get("docai_file"):
        docai_path = FIXTURES_DIR / manifest["docai_file"]
        if docai_path.exists():
            docai_text = docai_path.read_text(encoding="utf-8")

    result = _extract_questions_cached(mathpix_text, docai_text)
    questions = result.questions

    expected_count = manifest.get("expected_question_count")
    if expected_count is not None and len(questions) != expected_count:
        failures.append(f"expected {expected_count} questions, got {len(questions)}")

    # No two questions should be near-duplicates of each other -- this is
    # exactly the bug class that slips past _merge_question_lists' exact
    # options-tuple matching (see pipeline._is_likely_duplicate).
    for i, a in enumerate(questions):
        for b in questions[i + 1 :]:
            if pipeline._is_likely_duplicate(a, b):
                failures.append(
                    f"near-duplicate questions: {a.prompt_text[:60]!r} / {b.prompt_text[:60]!r}"
                )

    # prompt_text is the only version ever shown to a student -- it must
    # never contain a raw LaTeX command (see EXTRACTION_SYSTEM_PROMPT).
    for q in questions:
        m = _LATEX_COMMAND_PATTERN.search(q.prompt_text)
        if m:
            failures.append(f"raw LaTeX {m.group()!r} leaked into prompt_text: {q.prompt_text[:60]!r}")

    # No question should list the same option text twice.
    for q in questions:
        texts = [(opt.get("text") or "").strip().lower() for opt in q.options]
        if len(texts) != len(set(texts)):
            failures.append(f"duplicate options within one question: {q.prompt_text[:60]!r}")

    # Every image_url a question claims must actually exist in the source
    # (catches an invented/hallucinated URL).
    source_images = set(pipeline._extract_image_urls(mathpix_text))
    for q in questions:
        if q.image_url and q.image_url not in source_images:
            failures.append(f"invented image_url not present in source: {q.image_url}")

    if manifest.get("expects_table") and not any("<table>" in q.prompt_text for q in questions):
        failures.append("expected at least one <table> block in a question's prompt_text, found none")

    return failures


def main() -> int:
    manifest_path = FIXTURES_DIR / "manifest.json"
    if not manifest_path.exists():
        print(f"No fixtures manifest at {manifest_path} -- nothing to check.")
        return 0

    manifests = json.loads(manifest_path.read_text(encoding="utf-8"))
    overall_ok = True
    for manifest in manifests:
        name = manifest["name"]
        mathpix_path = FIXTURES_DIR / manifest["mathpix_file"]
        if not mathpix_path.exists():
            print(f"[{name}] SKIPPED -- fixture file missing: {mathpix_path}")
            continue
        failures = check_fixture(manifest)
        if failures:
            overall_ok = False
            print(f"[{name}] FAILED ({len(failures)} issue(s)):")
            for f in failures:
                print(f"  - {f}")
        else:
            print(f"[{name}] PASSED ({manifest.get('expected_question_count', '?')} questions)")

    return 0 if overall_ok else 1


if __name__ == "__main__":
    sys.exit(main())
