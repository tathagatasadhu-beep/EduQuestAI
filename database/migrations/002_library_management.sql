-- EduQuestAI Phase 1: parent library management, grading, student assignment
-- Run against the same Supabase Postgres project as 001_init.sql (SQL editor, no Alembic).

-- ── Subjects: grade level + manual ordering ───────────────────────
alter table subjects add column grade_level text;
alter table subjects add column sort_order integer not null default 0;

-- ── PDFs: theory vs practice, failure detail, soft delete ─────────
alter table pdfs add column content_type text not null default 'practice'
    check (content_type in ('theory', 'practice'));
alter table pdfs add column error_message text;
alter table pdfs add column deleted_at timestamptz;

-- ── Questions: deactivated instead of hard-deleted when their source
--    PDF is removed, so attempt/review history stays intact ────────
alter table questions add column is_active boolean not null default true;

-- ── Student assignments: which subjects/topics a parent has assigned
--    to a given student. topic_id null = whole subject assigned. ───
create table student_assignments (
    id          uuid primary key default gen_random_uuid(),
    student_id  uuid not null references students(id) on delete cascade,
    subject_id  uuid not null references subjects(id) on delete cascade,
    topic_id    uuid references topics(id) on delete cascade,
    created_at  timestamptz not null default now()
);
create index on student_assignments (student_id);
