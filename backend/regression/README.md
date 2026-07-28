# Extraction pipeline regression check

`run_regression.py` re-runs `ai-engine/pipeline.py`'s `extract_questions()` against
cached OCR text from real worksheets, and checks the result against failure
signatures already confirmed on real production data: dropped/duplicated
questions, orphaned images, raw LaTeX leaking into `prompt_text`, duplicate
options within one question, and (per-fixture) a missing expected `<table>`
block.

## Why cached OCR text, not a fresh PDF upload every time

Mathpix OCR and Document AI OCR are themselves slow, external, and cost money
per call — and their output for a given file doesn't change between runs, so
there's nothing to regression-test there. What *does* change between pipeline
edits is `extract_questions()` (chunking, merging, deduping, the extraction
prompt) — so each fixture caches one worksheet's `ocr_text` (Mathpix) and,
where relevant, its Document AI cross-check text once, and every regression
run replays only the OpenAI extraction call against that fixed input. This
still costs one real OpenAI call per fixture per run, but skips the OCR steps
entirely, and needs no PDF upload / Supabase round-trip.

## Fixtures are never committed

`fixtures/*.md` / `*.txt` / `*.pdf` are gitignored (see root `.gitignore`) —
they're verbatim OCR'd text from real, copyrighted SAT-style worksheet
content. `fixtures/manifest.json` (which fixture file to load + its expected
question count) *is* committed, since it holds no worksheet content itself.

This means fixtures only exist on whichever machine fetched them — if
`fixtures/*.md` is missing, `run_regression.py` skips that entry instead of
failing, so a fresh clone doesn't error out with nothing to check.

## Adding a new fixture

1. Get the worksheet's cached Mathpix `ocr_text` (already stored on its `Pdf`
   row in Postgres) and, if you want the Document AI cross-check path
   exercised too, run `pipeline.document_ai_ocr()` on the downloaded PDF once
   and save that output as well.
2. Save both as `fixtures/<name>_mathpix.md` / `fixtures/<name>_docai.txt`.
3. Add an entry to `manifest.json` with the exact question count you've
   manually verified is correct for that worksheet (this becomes the
   regression baseline — every future run must match it exactly, so only set
   it once you're confident the current extraction is fully correct).

## Running it

```
backend/venv/Scripts/python.exe backend/regression/run_regression.py
```

Exits 0 if every fixture passes, 1 if any fixture fails (with the specific
issues printed per fixture).
