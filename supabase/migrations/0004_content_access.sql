-- 0004_content_access
--
-- Two problems this solves.
--
-- 1. Nothing is readable. `read_tests` requires is_published, and 0002 forbids
--    publishing a test whose provenance is not shippable. Every test we hold is
--    third-party practice material, so no client can read any content at all.
--    Developers and testers still need to run real sessions against it.
--
-- 2. `questions_public` leaked. The view runs as its owner and therefore
--    bypasses RLS on `questions`, which is what keeps correct_answer out of
--    reach. But it also meant every question of every unpublished test was
--    readable by any signed-in user. The answer key was never exposed; the
--    prompts were.
--
-- The fix is an explicit allowlist rather than a weaker rule. Membership is
-- writable only by the service role, so a student cannot add themselves.

create table content_testers (
  user_id uuid primary key references auth.users on delete cascade,
  note text,
  created_at timestamptz not null default now()
);

alter table content_testers enable row level security;
-- Deliberately no client policies: this table is managed by the service role.

create or replace function can_read_unpublished()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from content_testers where user_id = auth.uid());
$$;

comment on function can_read_unpublished() is
  'True for users on the content_testers allowlist. Lets staff run sessions against unpublished content without publishing it.';

grant execute on function can_read_unpublished() to authenticated;

-- Widen the three content read policies to the allowlist.
drop policy read_tests on tests;
create policy read_tests on tests for select to authenticated
  using (is_published or can_read_unpublished());

drop policy read_sections on sections;
create policy read_sections on sections for select to authenticated
  using (exists (
    select 1 from tests t
     where t.id = test_id and (t.is_published or can_read_unpublished())));

drop policy read_groups on question_groups;
create policy read_groups on question_groups for select to authenticated
  using (exists (
    select 1 from sections s join tests t on t.id = s.test_id
     where s.id = section_id and (t.is_published or can_read_unpublished())));

-- Rebuild the client-safe projection so it filters by readability itself.
-- Still no correct_answer, accepted_variants or evidence: those columns are
-- not in the select list, and `questions` still has no select policy.
drop view questions_public;
create view questions_public as
  select q.id, q.group_id, q.ordinal, q.type, q.prompt, q.options
    from questions q
    join question_groups g on g.id = q.group_id
    join sections s on s.id = g.section_id
    join tests t on t.id = s.test_id
   where t.is_published or can_read_unpublished();

grant select on questions_public to authenticated;

comment on view questions_public is
  'Client-safe questions. Omits correct_answer, accepted_variants and evidence, and only exposes content the caller is allowed to read.';
