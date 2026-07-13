-- EduQuestAI Phase 2: AI tutor chat
-- Run against the same Supabase Postgres project as 001/002 (SQL editor, no Alembic).

-- The Mathpix OCR markdown was previously discarded after question-extraction — persist it
-- so the tutor chat has real worksheet content to ground answers in (see ai-engine/pipeline.py).
alter table pdfs add column ocr_text text;
