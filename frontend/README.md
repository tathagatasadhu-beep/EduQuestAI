# Frontend (not scaffolded — recommended setup)

Rather than ship a static Next.js template that goes stale, generate it fresh:

    npx create-next-app@latest . --typescript --tailwind --app

Then build these routes/components to mirror the interactive prototype
(`eduquest_prototype.html`) delivered alongside this scaffold:

- `src/app/parent/page.tsx` — Parent Dashboard: student cards (accuracy,
  streak, XP), PDF upload with processing status poll, question library
  browser (by Subject → Topic).
- `src/app/student/[studentId]/page.tsx` — Student Dashboard: personalized
  greeting (last weak topic), subject "quest" cards, Start Practice CTA.
- `src/app/student/[studentId]/quiz/[topicId]/page.tsx` — Quiz Engine:
  sequential question flow, instant feedback, review-queue re-injection.
- `src/components/` — shared: QuestionCard, ProgressTrail, XPBar,
  StreakBadge, UploadDropzone.
- `src/lib/api.ts` — thin fetch wrapper around the FastAPI routes in
  `backend/app/routers/`.

Auth: use `@supabase/ssr` for the parent email/password flow, and a custom
lightweight session (student login code -> httpOnly cookie) for the student
side — do not put the student flow through full Supabase email auth.
