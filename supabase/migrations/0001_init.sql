-- IELTS platform — initial schema
-- Content tables (tests/sections/questions) are PUBLIC READ, admin write.
-- User tables are strictly owner-scoped via RLS.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- enums
create type section_kind as enum ('reading','listening','writing','speaking');
create type session_status as enum ('in_progress','submitted','abandoned','expired');
create type question_type as enum (
  'multiple_choice','multi_select','true_false_not_given','yes_no_not_given',
  'matching_headings','matching_information','sentence_completion',
  'summary_completion','short_answer','form_completion','note_completion',
  'map_labelling','writing_task','speaking_part'
);

-- ---------------------------------------------------------------- profiles
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  target_band numeric(2,1),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- content
create table tests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  is_full_mock boolean not null default false,
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);

create table sections (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references tests on delete cascade,
  kind section_kind not null,
  ordinal smallint not null,
  duration_seconds integer not null,
  -- passage text, audio path, task prompt, cue card — shape varies by kind
  stimulus jsonb not null default '{}'::jsonb,
  unique (test_id, ordinal)
);

create table question_groups (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references sections on delete cascade,
  ordinal smallint not null,
  instructions text,
  -- shared options for matching_headings etc.
  shared_options jsonb,
  unique (section_id, ordinal)
);

create table questions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references question_groups on delete cascade,
  ordinal smallint not null,
  type question_type not null,
  prompt text not null,
  options jsonb,
  correct_answer jsonb,            -- never exposed to clients (see view below)
  accepted_variants text[],
  -- character offsets into the passage for "show answer in passage"
  evidence jsonb,
  unique (group_id, ordinal)
);

-- Client-safe projection: identical minus the answer key.
create view questions_public as
  select id, group_id, ordinal, type, prompt, options from questions;

-- ---------------------------------------------------------------- sessions
create table test_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  test_id uuid not null references tests,
  status session_status not null default 'in_progress',
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  -- for full mocks: which section the user is currently in
  current_section_id uuid references sections,
  created_at timestamptz not null default now()
);
create index on test_sessions (user_id, created_at desc);

create table answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references test_sessions on delete cascade,
  question_id uuid not null references questions,
  value jsonb,
  time_spent_seconds integer not null default 0,
  is_correct boolean,              -- filled at scoring time only
  updated_at timestamptz not null default now(),
  unique (session_id, question_id)
);
create index on answers (session_id);

-- ---------------------------------------------------------------- results
create table test_results (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references test_sessions on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  overall_band numeric(2,1),
  total_time_seconds integer,
  created_at timestamptz not null default now()
);
create index on test_results (user_id, created_at desc);

create table section_results (
  id uuid primary key default gen_random_uuid(),
  result_id uuid not null references test_results on delete cascade,
  section_id uuid not null references sections,
  kind section_kind not null,
  raw_score integer,
  raw_total integer,
  band numeric(2,1),
  time_seconds integer,
  -- {"true_false_not_given": {"correct": 3, "total": 6}, ...}
  accuracy_by_type jsonb not null default '{}'::jsonb
);

create table mistakes (
  id uuid primary key default gen_random_uuid(),
  result_id uuid not null references test_results on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  question_id uuid not null references questions,
  question_type question_type not null,
  user_answer jsonb,
  correct_answer jsonb,
  time_spent_seconds integer,
  created_at timestamptz not null default now()
);
create index on mistakes (user_id, question_type);

-- ------------------------------------------------- productive skill output
create table writing_submissions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references test_sessions on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  section_id uuid not null references sections,
  task_number smallint not null check (task_number in (1,2)),
  body text not null,
  word_count integer not null,
  time_spent_seconds integer,
  task_response numeric(2,1),
  coherence_cohesion numeric(2,1),
  lexical_resource numeric(2,1),
  grammatical_range numeric(2,1),
  band numeric(2,1),
  created_at timestamptz not null default now()
);

create table speaking_submissions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references test_sessions on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  section_id uuid not null references sections,
  part smallint not null check (part in (1,2,3)),
  audio_path text,                 -- storage bucket 'speaking', private
  transcript text,
  duration_seconds integer,
  -- {"fillers": {"uh": 8}, "long_pauses": 12, "wpm": 118, "ttr": 0.41}
  metrics jsonb not null default '{}'::jsonb,
  band numeric(2,1),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- ai cache
create table ai_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  scope text not null,             -- 'mistake' | 'writing' | 'speaking' | 'overall'
  subject_id uuid not null,        -- mistakes.id / writing_submissions.id / ...
  prompt_version text not null,
  payload jsonb not null,          -- what was sent (auditable, replayable)
  analysis jsonb not null,         -- structured response
  created_at timestamptz not null default now(),
  unique (scope, subject_id, prompt_version)
);

-- ---------------------------------------------------------------- progress
create table user_progress (
  user_id uuid not null references auth.users on delete cascade,
  kind section_kind not null,
  band numeric(2,1) not null,
  recorded_at timestamptz not null default now(),
  result_id uuid references test_results on delete cascade,
  primary key (user_id, kind, recorded_at)
);

-- ---------------------------------------------------------------- RLS
alter table profiles              enable row level security;
alter table test_sessions         enable row level security;
alter table answers               enable row level security;
alter table test_results          enable row level security;
alter table section_results       enable row level security;
alter table mistakes              enable row level security;
alter table writing_submissions   enable row level security;
alter table speaking_submissions  enable row level security;
alter table ai_analyses           enable row level security;
alter table user_progress         enable row level security;

alter table tests           enable row level security;
alter table sections        enable row level security;
alter table question_groups enable row level security;
alter table questions       enable row level security;

-- published content is readable by any authenticated user
create policy read_tests on tests for select to authenticated
  using (is_published);
create policy read_sections on sections for select to authenticated
  using (exists (select 1 from tests t where t.id = test_id and t.is_published));
create policy read_groups on question_groups for select to authenticated
  using (exists (
    select 1 from sections s join tests t on t.id = s.test_id
    where s.id = section_id and t.is_published));
-- NOTE: no select policy on `questions`. Clients read `questions_public`
-- (security_invoker off) so correct_answer can never leak. Scoring runs in
-- a security definer function.

create policy own_profile on profiles for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy own_sessions on test_sessions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy own_answers on answers for all to authenticated
  using (exists (select 1 from test_sessions s
                 where s.id = session_id and s.user_id = auth.uid()))
  with check (exists (select 1 from test_sessions s
                 where s.id = session_id and s.user_id = auth.uid()
                   and s.status = 'in_progress'));

create policy own_results on test_results for select to authenticated
  using (user_id = auth.uid());
create policy own_section_results on section_results for select to authenticated
  using (exists (select 1 from test_results r
                 where r.id = result_id and r.user_id = auth.uid()));
create policy own_mistakes on mistakes for select to authenticated
  using (user_id = auth.uid());
create policy own_writing on writing_submissions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_speaking on speaking_submissions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy own_ai on ai_analyses for select to authenticated
  using (user_id = auth.uid());
create policy own_progress on user_progress for select to authenticated
  using (user_id = auth.uid());

-- Results, mistakes and progress are written only by the scoring function
-- (security definer) — no insert/update policies for clients on purpose.
