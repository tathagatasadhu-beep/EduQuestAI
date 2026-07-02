# EduQuestAI — Developer Handoff Scaffold

This is a **starter scaffold**, not a finished product. It gives a developer (or you, with Claude Code) the
repository shape, database schema, API contracts, and pipeline stubs described in the EduQuestAI spec, so the
build starts from working structure instead of a blank folder.

A companion interactive prototype (`eduquest_prototype.html`, shared alongside this scaffold) demonstrates the
intended UX — parent dashboard, student quiz flow, review queue, mastery tracking — using mock data. Use it as
the product reference while implementing the real thing.

## What's real vs. stubbed

| Piece | Status |
|---|---|
| Repo structure | Real, matches the spec |
| Database schema (`database/migrations/001_init.sql`) | Real, ready to run against Postgres |
| FastAPI app skeleton, routers, Pydantic models | Real structure, endpoints return mock/placeholder data |
| Auth (parent + restricted student login codes) | Stubbed — wire up Supabase Auth or your own JWT flow |
| AI ingestion pipeline (`ai-engine/pipeline.py`) | Stubbed — shows the intended OCR → LLM extraction → tagging flow with TODOs for Mathpix/Nougat + OpenAI calls |
| Frontend | Not scaffolded as a Next.js app here (avoids shipping a stale `node_modules`-era template) — see `frontend/README.md` for the recommended `create-next-app` command and the component/page map that mirrors the prototype |
| Docker Compose | Real, boots Postgres + backend for local dev |

## Suggested build order

1. `docker-compose up` to get Postgres running, apply `database/migrations/001_init.sql`.
2. Wire real Supabase (or your own) auth into `backend/app/routers/auth.py`.
3. Implement `ai-engine/pipeline.py` against Mathpix or Nougat + an LLM call for question extraction.
4. Scaffold the Next.js frontend per `frontend/README.md`, build screens against the prototype as a visual/UX reference.
5. Connect quiz submission → `Attempts` table → mastery calculation → Review Queue logic.

## Multi-tenancy & security notes

- Every table that stores family/student data carries a `parent_user_id` (directly or via `student_id`).
  Enforce row-level security in Postgres (Supabase RLS policies) rather than relying on application code alone —
  see comments in `database/migrations/001_init.sql`.
- Student login codes should be short-lived, rotateable, and scoped to a single parent account — never a
  reusable global code.
- Uploaded PDFs (worksheets) can contain a child's name, school, handwriting. Store them in a private bucket
  per parent account, not a shared bucket with path-based "privacy."
