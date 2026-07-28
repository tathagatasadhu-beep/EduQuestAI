"""
Regression check for the PDF extraction pipeline (ai-engine/pipeline.py).

Runs pipeline.extract_questions() against cached OCR fixtures for each
reference worksheet and checks the result against known failure signatures
already confirmed on real production data: dropped/duplicated questions,
orphaned images, raw LaTeX leaking into prompt_text, duplicate options
within one question. The OCR text itself is cached (see fixtures/README.md)
so each run only re-pays for the OpenAI extraction call, not Mathpix/
Document AI -- cheap and fast enough to run before shipping every pipeline
change, instead of the manual re-upload-and-eyeball cycle this replaces.

Usage:
    backend/venv/Scripts/python.exe backend/regression/run_regression.py
"""
import json
import re
import sys
from pathlib import Path

REGRESSION_DIR = Path(__file__).parent
FIXTURES_DIR = REGRESSION_DIR / "fixtures"
BACKEND_DIR = REGRESSION_DIR.parent
AI_ENGINE_DIR = BACKEND_DIR.parent / "ai-engine"

sys.path.insert(0, str(AI_ENGINE_DIR))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(BACKEND_DIR / ".env")

import pipeline  # noqa: E402

_LATEX_COMMAND_PATTERN = re.compile(r"\\[a-zA-Z]+")


def check_fixture(manifest: dict) -> list[str]:
    """Returns a list of failure messages; empty means the fixture passed."""
    failures = []
    mathpix_text = (FIXTURES_DIR / manifest["mathpix_file"]).read_text(encoding="utf-8")
    docai_text = None
    if manifest.get("docai_file"):
        docai_path = FIXTURES_DIR / manifest["docai_file"]
        if docai_path.exists():
            docai_text = docai_path.read_text(encoding="utf-8")

    result = pipeline.extract_questions(mathpix_text, docai_text)
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
