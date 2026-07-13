# EduQuestAI — Project Brief for Claude Code

Read this first. It's the context a new engineer (or Claude Code) needs to pick up where this project left off.

## What this is

A private, family-use adaptive learning platform. Parents upload curriculum worksheets (RSM, SAT, AP
Calculus/Physics PDFs); an AI pipeline extracts individual questions and answer keys; students practice through
a gamified quiz engine with mastery tracking and a spaced-review queue. Full product spec context: this repo was
generated from a detailed spec — the `README.md` in this root summarizes it; ask the owner for the original spec
doc if you need the full phase-by-phase feature list.

A working **visual/UX reference** exists as a static HTML mock (`eduquest_prototype.html`, delivered alongside
this repo, not part of it) — treat it as the source of truth for how each screen should look and behave, not
as code to reuse directly.

## Status: live in production

As of 2026-07-09, the app is fully built and deployed — not a scaffold anymore. Read the actual code before
assuming anything is a stub.

- **Frontend**: https://edu-quest-ai-nu.vercel.app (Vercel)
- **Backend**: https://eduquestai-api.onrender.com (Render) — health check at `/api/health`
- **Database/Auth/Storage**: Supabase (Postgres + Auth + Storage), project ref `bwghfzhsvsfhzdzsebyc`
- **GitHub**: https://github.com/tathagatasadhu-beep/EduQuestAI (a stale duplicate also exists at
  `tathagatasadhu-beep/ChatGPTEduapp` from an early URL mix-up during setup — ignore it, not used)

### What's real and working end-to-end

- **Auth** (`backend/app/routers/auth.py`) — Supabase Auth for parents (email/password, JWKS-verified tokens
  via `app/core/security.py::decode_supabase_jwt`), first-party JWT for student login codes
  (`app/core/security.py::create_student_token`).
- **Quiz engine** (`quiz.py`) — `next-question` prioritizes due review-queue items over fresh ones (with a
  cooldown so retries require a separate session), `submit` scores answers, updates the review queue, and
  awards gamification (see below).
- **PDF ingestion** (`pdfs.py` + `ai-engine/pipeline.py`) — Mathpix OCR + OpenAI extraction, Supabase Storage
  upload, background processing with live status polling. Supports multiple files at once. Subject and topic
  are both auto-suggested by the AI pipeline (parent can still pick/create a subject manually if they want —
  the "✨ Auto-detect subject" option is just the default).
- **Gamification** — quiz answers award XP (+10 correct, +15 bonus for resolving a review-queue item) and
  update daily-practice streaks derived from attempt history (`quiz.py::_apply_streak` — no separate
  "last active" column, computed from `Attempt.answered_at`). Frontend shows a live XP bar, streak badge,
  floating "+N XP" toast, and a level-up celebration animation.
- **Frontend** — full Next.js 16 app (`frontend/`): parent dashboard, student quest trail, quiz flow, all
  auth pages. Architecture note: the browser never calls the backend directly — Server Components read
  session cookies and call the backend server-to-server, and client components go through same-origin Route
  Handlers that act as a thin backend-for-frontend. This is why Vercel only needs one env var (`BACKEND_URL`,
  no `NEXT_PUBLIC_` prefix) instead of exposing the backend URL or Supabase keys to client JS.
- **Progress tracking / wrong-answer review** — mastery % per topic (`students.py::get_mastery`, also
  self-service at `/me/mastery` for students), review queue resolves after 2 correct answers in a row.
- **Parent library management** (Phase 1, added 2026-07-12) — full CRUD + reorder for subjects/topics
  (`subjects.py`), each `Subject` now has `grade_level` (free text: `'7'`, `'SSAT'`, `'SAT'`, etc.) and
  `sort_order` for grouping/ordering in `frontend/src/app/parent/library/`. PDFs can be listed, soft-deleted
  (`DELETE /api/pdfs/{id}` sets `deleted_at` and flips their `Question.is_active` to `false` instead of hard
  deleting — see the comment atop `pdfs.py` for why: hard-deleting a Question would cascade-wipe a student's
  `attempts`/`review_queue` history), and tagged `content_type` (`theory` vs `practice`). Upload failures now
  surface the real `Pdf.error_message` in the UI instead of a generic message.
- **Student assignment** — parents assign specific subjects (or individual topics within a subject) to a
  student via the new `student_assignments` table and the checklist UI in `StudentSettings.tsx`. Not yet
  consumed by the student side (see Phase 2 below) — the "My Subjects" dropdown that reads these doesn't exist
  yet, this only builds the assignment data model and parent-side UI.
- **Parent password reset** — `POST /api/auth/parent/forgot-password` → Supabase's
  `reset_password_for_email`. The completion page (`frontend/src/app/parent/reset-password/page.tsx`) is a
  deliberate, narrow exception to "the browser never talks to Supabase directly": it uses `@supabase/supabase-js`
  client-side because Supabase's recovery flow needs the browser to hold the recovery session and call
  `updateUser()` directly — see the comment at the top of that file. This is why `NEXT_PUBLIC_SUPABASE_URL`/
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` now exist as frontend env vars (anon key is meant to be public).
- **Login-code regeneration** — `POST /api/students/{id}/login-code/regenerate` (parent-driven; students have
  no self-service "forgot code" since they don't have email/password).

### What's still missing (confirmed via a full feature audit against the user's spec, 2026-07-08; re-checked 2026-07-12)

- **AI tutor** — not built at all. No chat/explain-this-question feature exists anywhere. This is Phase 2.
- **Student nav redesign** (Home / My Subjects / Practice / Badge / Help) — also Phase 2; the student side is
  still the single-page dashboard at `frontend/src/app/student/[studentId]/page.tsx`. Phase 2 will consume the
  `student_assignments` data built in Phase 1 to populate "My Subjects."
- **Timed quizzes** — no timer/time-limit concept anywhere in the quiz engine.
- **Parent approval workflow** — the spec's PDF workflow has a "Parent Review" gate before topics/questions
  become usable; ours publishes immediately after extraction. No approve/reject UI exists (library management
  added delete/reorder/content-type tagging, but not a pre-publish approval gate).
- **Question object gaps** — `page_number` doesn't exist as a column; `image_path` exists on `Question` but is
  never populated (the pipeline doesn't crop/save an image, only OCR text/LaTeX); no `subtopic` or `tags`
  concept exists. `explanation` on `AttemptResult` is intentionally always `None` — matches the spec's own
  "(future)" marker, not a gap.
- **Gamification extras** — XP and streaks work; no badges, levels-as-rewards, or leaderboards exist beyond
  the level number derived from XP. Badges are planned for Phase 2.
- **Known extraction-quality issue** (not a code bug, an LLM-output gap): multi-part questions with no single
  canonical answer (e.g. "a. 6x  b. -10x  c. x-5") sometimes come back from the extraction prompt with zero
  answer options — those questions get no `answer_keys` row, so any student attempt on them always grades as
  incorrect. Confirmed against a real RSM worksheet PDF.
- `review_queue.py`'s dedicated endpoint is an unused stub — `quiz.py::next-question` already handles
  review-queue prioritization internally, so a separate endpoint was never actually needed.

## Deployment gotchas already solved — don't re-debug these

- **Supabase direct-connection host is IPv6-only.** `db.<ref>.supabase.co:5432` fails with
  `OSError: Network is unreachable` on IPv4-only platforms (Render included). Must use Supabase's
  **connection pooler** instead: `postgresql://postgres.<project-ref>:<password>@aws-1-us-west-2.pooler.supabase.com:6543/postgres`
  (transaction mode, port 6543). The exact pooler hostname/region is specific to this Supabase project —
  get it fresh from Supabase's dashboard "Connect" dialog if it's ever needed again, don't guess it.
- **The pooler needs `connect_args={"statement_cache_size": 0}`** on the SQLAlchemy engine
  (`backend/app/db/session.py`, already there, guarded to only apply for `postgresql+asyncpg://` URLs). The
  pooler's transaction mode doesn't support asyncpg's default server-side prepared-statement caching — a
  statement prepared against one pooled backend connection may not exist on the next one a later query lands
  on, which surfaces as random query failures without this.
- **Render ignores `runtime.txt` and the `PYTHON_VERSION` env var** when the service's Root Directory is a
  subfolder (`backend`) — it built with the newest available Python (3.14) regardless of both being set.
  Rather than fight Render's version detection, the actual incompatibility got fixed instead: `sqlalchemy`
  is pinned to `2.0.51` (not `2.0.35`), which is required for Python 3.14 — older SQLAlchemy crashes on
  `Mapped[X | None]` annotations under 3.14's changed `typing` internals
  (`TypeError: descriptor '__getitem__' requires a 'typing.Union' object but received a 'tuple'`).
- **Vercel only needs `BACKEND_URL`** (server-only, no `NEXT_PUBLIC_` prefix) — see the frontend architecture
  note above for why. Also has `"engines": {"node": ">=20.9.0"}` in `frontend/package.json` (Next.js 16's
  minimum) so Vercel doesn't pick an incompatible default.
- CORS in `backend/app/main.py` still only allows `localhost:3000` — deliberately left as-is, since it's
  irrelevant in production given the architecture above (the browser never talks to the backend directly).
- **Secrets are never in this repo.** All real values (`DATABASE_URL`, `SUPABASE_*`, `APP_JWT_SECRET`,
  `OPENAI_API_KEY`, `MATHPIX_*`) live only in `backend/.env` locally (gitignored, never committed) and in
  **Render's environment variables** for production. `frontend/.env.local` (also gitignored) holds
  `BACKEND_URL` for local frontend dev; Vercel's project environment variables hold it in production. If you
  need a real value, ask the user or check those two dashboards — don't expect to find it in git history.

## Local dev machine is ARM64 Windows — can't run the backend directly

`asyncpg` has no prebuilt wheel for win-arm64, and building it from source needs a full MSVC+Rust toolchain
that isn't installed. This is a local-machine-only limitation — Render (Linux x86_64) installs it from a
wheel with zero issues, so don't "fix" this in a way that changes production behavior.

- **Local backend testing**: swap `DATABASE_URL` to `sqlite+aiosqlite:///<path>` *before* importing
  `app.db.session`, then exercise the real FastAPI endpoints via `TestClient`. `backend/dev_server_sqlite.py`
  is a committed, clearly-separate-from-production entrypoint that does exactly this (seeds a demo
  Subject/Topic/Question too) — use it as the `backend` launch config for browser-based preview testing.
- Node.js + npm are installed at `C:\Program Files\nodejs` but not on PATH in most tool shells — prepend
  `$env:Path = "C:\Program Files\nodejs;$env:Path"` in PowerShell, or use `frontend/dev.cmd` (sets PATH
  itself) as the `frontend` launch config entry.
- A second Python install (3.14, at `C:\Users\sayan\AppData\Local\Programs\Python\Python314\python.exe`)
  exists separately from the project's actual venv (3.12) — useful for reproducing/verifying Python-3.14-only
  bugs (like the SQLAlchemy one above) against a real interpreter before pushing a fix blind.
- `gh` CLI is installed but `gh auth login --with-token` fails validation against the cached
  git-credential-manager token (it wants a `read:org` scope the token doesn't have, which isn't actually
  needed for PR creation). Workaround: extract the token via
  `git credential fill` (protocol=https, host=github.com) and call the GitHub REST API directly with `curl`
  instead of going through `gh`.

## Conventions

- Every table/query that touches family data must be scoped by `parent_user_id` (directly or via `student_id`).
  Don't rely on Postgres RLS alone — the app-layer `parent_id` filter in `students.py` is the pattern to repeat.
- Never commit real API keys or `.env` — only `.env.example`.
- Keep response models in `app/models/schemas.py` in sync with the ORM in `app/db/orm.py`.
- Student-facing copy should stay warm/game-like; parent-facing copy should stay plain and data-forward — see the
  tone split in the prototype (greeting banner vs. dashboard tables), and how it plays out in the frontend
  (`frontend/src/app/student/` vs `frontend/src/app/parent/`).
- FastAPI routes with a fixed path segment (e.g. `/me`) must be registered *before* a wildcard path param
  route with the same shape (e.g. `/{student_id}`) in the same router — FastAPI matches in registration
  order, and the wildcard route will otherwise swallow the fixed one and 422 on the type conversion. See the
  comment in `students.py` above `get_my_profile` for the concrete example.
- `ai-engine/` has a hyphen in its name, so it can't be imported as a normal Python package. `pdfs.py` adds
  its directory to `sys.path` and imports `pipeline` directly by file location — see the comment at the top
  of `pdfs.py`. Don't try `from ai_engine import pipeline`, it doesn't work.

## Deployment

See `DEPLOY.md` in this same root for the original hosting plan — note it predates the actual deployment and
its exact env-var list is now superseded by the "Deployment gotchas" section above (e.g. it doesn't mention
the connection pooler requirement or that Vercel only needs `BACKEND_URL`). Follow this file's gotchas section
over `DEPLOY.md` where they conflict.

**Not yet applied to production** (as of the Phase 1 library-management work, 2026-07-12) — do these before
that code reaches Render/Vercel:
- Run `database/migrations/002_library_management.sql` against the production Supabase project (Supabase SQL
  editor, same as `001_init.sql` was — there's no Alembic).
- Add `FRONTEND_URL` to Render's env vars (the production frontend origin, for the password-reset redirect
  link).
- Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to Vercel's env vars (see the
  password-reset note above for why these are needed despite the "browser never talks to Supabase" rule).
