-- EduQuestAI initial schema
-- Run against Postgres (Supabase-compatible). Enable pgcrypto for gen_random_uuid().

create extension if not exists "pgcrypto";

-- ── Users (Parents) ─────────────────────────────────────────────
create table users (
    id              uuid primary key default gen_random_uuid(),
    email           text unique not null,
    full_name       text not null,
    role            text not null default 'parent' check (role in ('parent', 'admin')),
    created_at      timestamptz not null default now()
);

-- ── Students (sub-profiles under a parent) ─────────────────────
create table students (
    id                  uuid primary key default gen_random_uuid(),
    parent_user_id      uuid not null references users(id) on delete cascade,
    display_name        text not null,
    grade_level         text,
    login_code_hash     text not null,          -- store a hash, never the raw code
    login_code_expires_at timestamptz,
    xp_total            integer not null default 0,
    streak_days         integer not null default 0,
    created_at          timestamptz not null default now()
);
create index on students (parent_user_id);

-- ── Subjects (top-level) ─────────────────────────────────────────
create table subjects (
    id          uuid primary key default gen_random_uuid(),
    name        text not null,                  -- e.g. "AP Calculus", "RSM Grade 8"
    description text
);

-- ── Topics (belongs to a subject) ────────────────────────────────
create table topics (
    id          uuid primary key default gen_random_uuid(),
    subject_id  uuid not null references subjects(id) on delete cascade,
    name        text not null,                  -- e.g. "Compound Inequalities"
    sort_order  integer default 0
);
create index on topics (subject_id);

-- ── PDFs (uploaded source documents) ─────────────────────────────
create table pdfs (
    id              uuid primary key default gen_random_uuid(),
    uploaded_by     uuid not null references users(id) on delete cascade,
    subject_id      uuid references subjects(id),
    storage_path    text not null,               -- private bucket path, scoped per parent
    original_name   text not null,
    status          text not null default 'pending'
                        check (status in ('pending','processing','extracted','failed')),
    page_count      integer,
    uploaded_at     timestamptz not null default now()
);
create index on pdfs (uploaded_by);

-- ── Questions (extracted from PDFs) ──────────────────────────────
create table questions (
    id              uuid primary key default gen_random_uuid(),
    pdf_id          uuid references pdfs(id) on delete set null,
    topic_id        uuid not null references topics(id),
    prompt_text     text not null,
    prompt_latex    text,                        -- for math expressions
    image_path      text,                        -- optional figure/diagram
    difficulty      text check (difficulty in ('easy','medium','hard')),
    question_type   text not null default 'multiple_choice'
                        check (question_type in ('multiple_choice','free_response')),
    created_at      timestamptz not null default now()
);
create index on questions (topic_id);
create index on questions (pdf_id);

-- ── Answer Keys ───────────────────────────────────────────────────
create table answer_keys (
    id              uuid primary key default gen_random_uuid(),
    question_id     uuid not null references questions(id) on delete cascade,
    option_label    text,                        -- 'A' / 'B' / null for free response
    option_text     text not null,
    is_correct      boolean not null default false
);
create index on answer_keys (question_id);

-- ── Attempts (every answer a student submits) ────────────────────
create table attempts (
    id                  uuid primary key default gen_random_uuid(),
    student_id          uuid not null references students(id) on delete cascade,
    question_id         uuid not null references questions(id) on delete cascade,
    submitted_answer    text,
    is_correct          boolean not null,
    attempt_number      integer not null default 1,   -- 1st vs retry, for accuracy calc
    answered_at         timestamptz not null default now()
);
create index on attempts (student_id);
create index on attempts (question_id);

-- ── Review Queue (incorrect answers, retried until 2 correct in a row across sessions) ─
create table review_queue (
    id                      uuid primary key default gen_random_uuid(),
    student_id              uuid not null references students(id) on delete cascade,
    question_id             uuid not null references questions(id) on delete cascade,
    consecutive_correct     integer not null default 0,  -- resolved at 2
    last_seen_at            timestamptz,
    resolved                boolean not null default false,
    created_at              timestamptz not null default now(),
    unique (student_id, question_id)
);
create index on review_queue (student_id, resolved);

-- ── Row-level security (Supabase-style) ──────────────────────────
-- Enable RLS and scope every table to the owning parent so families can never see
-- each other's data. Example for `students`; replicate the pattern per table.
alter table students enable row level security;
create policy "parent owns their students"
    on students for all
    using (parent_user_id = auth.uid());

-- Repeat equivalent policies (joined through students/parent_user_id) for:
-- pdfs, questions (via topic->subject, generally readable if global library, else scope by pdf.uploaded_by),
-- attempts, review_queue (scope by student_id -> students.parent_user_id = auth.uid()).
