# Deploying EduQuestAI

A concrete path from this repo to a live URL, using free/cheap tiers appropriate for a family-scale app.
Stack: **Vercel** (frontend) + **Supabase** (Postgres, Auth, Storage) + **Render** (FastAPI backend).

## 0. Prerequisites

- GitHub account (you have this)
- Free accounts on [supabase.com](https://supabase.com), [vercel.com](https://vercel.com), [render.com](https://render.com)
- `git`, `node`, `python3` installed locally (Claude Code will check/handle this)

## 1. Push this repo to GitHub

```bash
cd eduquest-ai
git init
git add .
git commit -m "Initial scaffold"
git branch -M main
gh repo create eduquest-ai --private --source=. --push
# (no gh CLI? create an empty repo on github.com, then:)
# git remote add origin https://github.com/<you>/eduquest-ai.git
# git push -u origin main
```

## 2. Database — Supabase

1. Create a new Supabase project.
2. In the SQL Editor, paste and run `database/migrations/001_init.sql`.
3. Grab from Project Settings → API: `Project URL`, `anon public key`, `service_role key`.
4. Grab from Project Settings → Database: the connection string → this is your `DATABASE_URL`.

## 3. Backend — Render

1. New → Web Service → connect your GitHub repo, root directory `backend/`.
2. Build command: `pip install -r requirements.txt`
3. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Add environment variables (from `.env.example`): `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `MATHPIX_APP_ID`, `MATHPIX_APP_KEY`.
5. Deploy. Note the resulting URL, e.g. `https://eduquest-api.onrender.com`.

## 4. Frontend — Vercel

1. Once the Next.js app exists in `frontend/` (see `CLAUDE.md` priority #4), import the repo into Vercel,
   root directory `frontend/`.
2. Add environment variable `NEXT_PUBLIC_API_URL` = your Render backend URL.
3. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for client-side Supabase Auth.
4. Deploy. Vercel gives you a `*.vercel.app` URL immediately; add your own domain under Project → Domains once
   you've bought one.

## 5. Ongoing costs (separate from any Claude/Anthropic subscription)

| Item | Approx. cost |
|---|---|
| Vercel (frontend) | Free tier covers a family-scale app |
| Supabase (DB/auth/storage) | Free tier, then ~$25/mo if you outgrow it |
| Render (backend) | Free tier sleeps when idle; ~$7/mo for always-on |
| Domain | ~$12/year |
| OpenAI/Mathpix API calls | Pay-per-use, driven by how many worksheets get uploaded |

None of these depend on keeping a Claude subscription active — they bill independently through each provider.

## 6. Handing this to Claude Code

Open a terminal in the repo root and run `claude`. It will read `CLAUDE.md` automatically and pick up the
priority list from there. Suggested first prompt:

> Read CLAUDE.md and start on priority #1 (auth). Ask me for my Supabase project URL and keys before you begin.
