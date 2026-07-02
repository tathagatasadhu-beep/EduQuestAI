# EduQuestAI — Project Brief for Claude Code

Read this first. It's the context a new engineer (or Claude Code) needs to pick up where this scaffold left off.

## What this is

A private, family-use adaptive learning platform. Parents upload curriculum worksheets (RSM, SAT, AP
Calculus/Physics PDFs); an AI pipeline extracts individual questions and answer keys; students practice through
a gamified quiz engine with mastery tracking and a spaced-review queue. Full product spec context: this repo was
generated from a detailed spec — the `README.md` in this root summarizes it; ask the owner for the original spec
doc if you need the full phase-by-phase feature list.

A working **visual/UX reference** exists as a static HTML mock (`eduquest_prototype.html`, delivered alongside
this repo, not part of it) — treat it as the source of truth for how each screen should look and behave, not
as code to reuse directly.

## Current state (read before writing code)

- `database/migrations/001_init.sql` — full Postgres schema, all 9 tables, real and ready to run.
- `backend/app/db/orm.py` + `session.py` — real SQLAlchemy async setup.
- `backend/app/routers/students.py` — **fully implemented reference pattern** (real DB queries, real mastery-rate
  calculation). Copy this shape for the other routers.
- `backend/app/routers/{auth,subjects,pdfs,quiz,review_queue}.py` — stubs with `...` bodies and TODO comments.
  These are next.
- `ai-engine/pipeline.py` — stub. OCR (Mathpix/Nougat) and LLM extraction calls are not wired up.
- `frontend/` — empty except a README describing the intended page map. Not scaffolded as a Next.js app yet.

## Priority order for finishing the build

1. **Auth** (`backend/app/routers/auth.py` + `students.py::get_current_parent_id`) — wire real Supabase Auth
   (parent email/password) and the student login-code flow. Every other router's ownership checks depend on this.
2. **Quiz engine** (`quiz.py`) — `next-question` and `submit` endpoints. The scoring/review-queue logic is
   described in the code comments; the accuracy-rate formula is already correctly implemented in
   `students.py::get_mastery` — use the same query pattern.
3. **PDF ingestion** (`pdfs.py` + `ai-engine/pipeline.py`) — file upload to Supabase Storage, background job
   calling the OCR + LLM extraction pipeline, writing to `questions`/`answer_keys`.
4. **Frontend** — run `npx create-next-app@latest . --typescript --tailwind --app` inside `frontend/`, then build
   the pages listed in `frontend/README.md`, matching the prototype's screens (parent dashboard, student quest
   trail, quiz flow).
5. **Gamification polish** (streaks, XP animations, personalized greeting copy) — last, per the original spec's
   own phase ordering.

## Conventions

- Every table/query that touches family data must be scoped by `parent_user_id` (directly or via `student_id`).
  Don't rely on Postgres RLS alone — the app-layer `parent_id` filter in `students.py` is the pattern to repeat.
- Never commit real API keys or `.env` — only `.env.example`.
- Keep response models in `app/models/schemas.py` in sync with the ORM in `app/db/orm.py`.
- Student-facing copy should stay warm/game-like; parent-facing copy should stay plain and data-forward — see the
  tone split in the prototype (greeting banner vs. dashboard tables).

## Deployment

See `DEPLOY.md` in this same root for the exact hosting plan (Vercel + Supabase + Render) and step-by-step
commands.
