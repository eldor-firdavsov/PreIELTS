-- ════════════════════════════════════════════════════════════════════════
--  0017 — remove writing and speaking.
--
--  The product marks reading and listening. The two productive skills are
--  withdrawn: their papers, their submissions, their scoring functions, their
--  result views, their recordings bucket, and their contribution to the study
--  plan.
--
--  This is a forward migration, not a rewrite of 0012 and 0014. Those files
--  describe what the database was and stay where they are; a deployed database
--  is brought to the new shape by running this, not by pretending the old
--  shape never existed.
--
--  ── Order ───────────────────────────────────────────────────────────────
--  `delete from tests` on its own FAILS. `test_sessions.test_id` references
--  `tests` with no ON DELETE CASCADE, so any paper a student has opened is
--  pinned by its session. Deleting the sessions first unpins it and cascades
--  away everything hanging off them:
--
--    test_sessions ─┬─► test_results ─┬─► section_results
--                   │                 ├─► mistakes
--                   │                 └─► user_progress
--                   ├─► answers
--                   ├─► writing_submissions
--                   └─► speaking_submissions
--
--    tests ─► sections ─► question_groups ─► questions
--
--  ── What is deliberately left behind ────────────────────────────────────
--  The 'writing' and 'speaking' members of `section_kind`, and 'writing_task'
--  and 'speaking_part' in `question_type`. Postgres cannot drop an enum
--  member, and recreating either type would mean rewriting every column that
--  uses it — `sections.kind`, `section_results.kind`, `user_progress.kind`,
--  `questions.type` — for no gain. After this migration nothing references
--  them: no row carries one, no client can produce one, and `validate.ts`
--  rejects content that names one.
-- ════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. The papers ───────────────────────────────────────────────────────
-- Found by what they contain rather than by an external_id pattern. A
-- pattern is how you delete something you did not mean to.
create temp table doomed on commit drop as
  select distinct t.id
    from tests t
    join sections s on s.test_id = t.id
   where s.kind in ('writing', 'speaking');

-- Sessions first: this is the row that pins the paper.
delete from test_sessions where test_id in (select id from doomed);

-- Then the papers, which cascade to sections, groups and questions.
delete from tests where id in (select id from doomed);

-- `user_progress.result_id` is nullable, so a row that never carried one is
-- not reached by the cascade above. Take those by skill.
delete from user_progress where kind in ('writing', 'speaking');

-- ── 2. Cached model output for the withdrawn skills ─────────────────────
-- `ai_analyses.subject_id` carries no foreign key, so these rows would
-- otherwise outlive the submissions they describe. Study-plan rows are left
-- alone: they are keyed by prompt_version and stay readable, never rewritten.
delete from ai_analyses where scope in ('writing', 'speaking');

-- ── 3. Result views ─────────────────────────────────────────────────────
drop view if exists result_writing;
drop view if exists result_speaking;

-- ── 4. Scoring functions ────────────────────────────────────────────────
drop function if exists finalise_writing_session(uuid);
drop function if exists finalise_speaking_session(uuid);

-- ── 5. Submission tables ────────────────────────────────────────────────
-- Cascade takes the generated band columns, the check constraints, the
-- one-per-task and one-per-part indexes, the RLS policies and the column
-- grants with them.
drop table if exists writing_submissions cascade;
drop table if exists speaking_submissions cascade;

-- ── 6. round_half_band ──────────────────────────────────────────────────
-- Added by 0012 for the generated band columns and used by nothing else.
-- Reading and listening bands come from `raw_to_band()`.
drop function if exists round_half_band(numeric);

-- ── 7. The recordings bucket ────────────────────────────────────────────
-- Objects before the bucket: storage.objects references storage.buckets.
drop policy if exists "write own speaking recording"   on storage.objects;
drop policy if exists "replace own speaking recording" on storage.objects;
drop policy if exists "read own speaking recording"    on storage.objects;

delete from storage.objects where bucket_id = 'speaking';
delete from storage.buckets where id = 'speaking';

-- ── 8. The study plan's deterministic half ──────────────────────────────
-- Same function as 0015 with the writing and speaking CTEs and their two
-- jsonb keys removed. Everything a plan is reasoned from is now reading and
-- listening only. The inputs document changes shape, so every fingerprint
-- changes with it and the Edge Function's PROMPT_VERSION moves to
-- study-plan-v2; the v1 rows stay where they are, beside the numbers they
-- were written from.
create or replace function study_plan_inputs()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_inputs jsonb;
begin
  if v_uid is null then
    raise exception 'study_plan_inputs requires a signed-in caller';
  end if;

  with
  -- What the student is aiming at. Self-reported, and labelled as such.
  profile as (
    select p.target_band, p.current_band, p.cefr_level::text as cefr_level
      from profiles p
     where p.id = v_uid
  ),

  -- Every band ever recorded, most recent first within a skill.
  ranked as (
    select up.kind::text as kind,
           up.band,
           up.recorded_at,
           row_number() over (partition by up.kind order by up.recorded_at desc) as recency
      from user_progress up
     where up.user_id = v_uid and up.band is not null
  ),
  skills as (
    select r.kind,
           max(r.band) filter (where r.recency = 1)          as latest_band,
           max(r.band) filter (where r.recency = 2)          as previous_band,
           max(r.band)                                       as best_band,
           min(r.band)                                       as worst_band,
           count(*)                                          as attempts,
           min(r.recorded_at)                                as first_at,
           max(r.recorded_at)                                as latest_at
      from ranked r
     group by r.kind
  ),

  -- Accuracy by question type across every marked paper, not per paper.
  -- Mirrors result_type_accuracy, summed over results instead of grouped by one.
  types as (
    select q.type::text                            as question_type,
           count(*)                                as seen,
           count(*) filter (where a.is_correct)    as correct
      from test_results tr
      join test_sessions ts on ts.id = tr.session_id
      join sections s       on s.test_id = ts.test_id
      join question_groups g on g.section_id = s.id
      join questions q      on q.group_id = g.id
      left join answers a   on a.question_id = q.id and a.session_id = ts.id
     where tr.user_id = v_uid
     group by q.type
  ),

  -- Accuracy by position in the paper. Listening section 3 and reading passage
  -- 3 are where papers are usually lost, and that is a different finding from
  -- any question type.
  parts as (
    select s.kind::text                     as kind,
           s.ordinal                        as section_ordinal,
           sum(sr.raw_score)                as correct,
           sum(sr.raw_total)                as seen,
           sum(sr.time_seconds)             as time_seconds
      from section_results sr
      join test_results tr on tr.id = sr.result_id
      join sections s      on s.id = sr.section_id
     where tr.user_id = v_uid and sr.raw_total > 0
     group by s.kind, s.ordinal
  ),

  -- Per-result pace, on the same basis as result_overview: wall clock over the
  -- number of questions the paper actually had.
  paced as (
    select tr.id                                     as result_id,
           tr.total_time_seconds,
           coalesce(sum(sr.raw_total), 0)            as questions,
           case when coalesce(sum(sr.raw_total), 0) > 0
                then tr.total_time_seconds::numeric / sum(sr.raw_total)
           end                                       as avg_seconds
      from test_results tr
      left join section_results sr on sr.result_id = tr.id
     where tr.user_id = v_uid
     group by tr.id, tr.total_time_seconds
  ),
  timing as (
    -- avg() already ignores the papers that recorded no questions.
    select round(avg(p.avg_seconds))                                              as avg_seconds_per_question,
           count(*) filter (
             where p.avg_seconds is not null and m.time_spent_seconds >= p.avg_seconds * 1.5
           )                                                                  as slow_mistakes,
           count(*) filter (
             where p.avg_seconds is not null and m.time_spent_seconds <= p.avg_seconds * 0.4
           )                                                                  as rushed_mistakes,
           count(m.id)                                                        as mistakes_counted,
           count(m.id) filter (where m.user_answer is null)                   as unanswered
      from paced p
      left join mistakes m on m.result_id = p.result_id
  )

  select jsonb_build_object(
    'target_band',            (select target_band  from profile),
    'self_reported_band',     (select current_band from profile),
    'self_reported_cefr',     (select cefr_level   from profile),
    'results_counted',        (select count(*) from paced),
    'skills', coalesce((
      select jsonb_agg(jsonb_build_object(
               'skill',         sk.kind,
               'latest_band',   sk.latest_band,
               'previous_band', sk.previous_band,
               'best_band',     sk.best_band,
               'worst_band',    sk.worst_band,
               'attempts',      sk.attempts,
               'first_at',      sk.first_at,
               'latest_at',     sk.latest_at
             ) order by sk.kind)
        from skills sk), '[]'::jsonb),
    'question_types', coalesce((
      select jsonb_agg(jsonb_build_object(
               'question_type',   t.question_type,
               'seen',            t.seen,
               'correct',         t.correct,
               'percent_correct', round(t.correct::numeric * 100 / t.seen)
             ) order by round(t.correct::numeric * 100 / t.seen), t.question_type)
        from types t where t.seen > 0), '[]'::jsonb),
    'sections', coalesce((
      select jsonb_agg(jsonb_build_object(
               'skill',           pa.kind,
               'section_number',  pa.section_ordinal,
               'seen',            pa.seen,
               'correct',         pa.correct,
               'percent_correct', round(pa.correct::numeric * 100 / pa.seen),
               'time_seconds',    pa.time_seconds
             ) order by pa.kind, pa.section_ordinal)
        from parts pa), '[]'::jsonb),
    'timing', (
      select jsonb_build_object(
               'avg_seconds_per_question', ti.avg_seconds_per_question,
               'mistakes_counted',         ti.mistakes_counted,
               'unanswered',               ti.unanswered,
               'slow_mistakes',            ti.slow_mistakes,
               'rushed_mistakes',          ti.rushed_mistakes)
        from timing ti)
  )
  into v_inputs;

  return jsonb_build_object(
    -- The caller's id is part of the digest, so two students with identical
    -- statistics can never collide onto one cached row.
    'fingerprint',
      substring(
        encode(extensions.digest(v_uid::text || e'\n' || v_inputs::text, 'sha256'), 'hex')
        for 32
      )::uuid,
    'inputs', v_inputs
  );
end;
$$;

comment on function study_plan_inputs() is
  'Counts and stored bands for the signed-in student, plus a fingerprint of them. The only thing the study-plan Edge Function may send to a model.';

revoke all on function study_plan_inputs() from public, anon;
grant execute on function study_plan_inputs() to authenticated;

-- ── Prove it ────────────────────────────────────────────────────────────
-- Every column must be 0.
do $check$
declare
  v_tests     int;
  v_sections  int;
  v_progress  int;
  v_tables   int;
  v_funcs    int;
  v_views    int;
  v_bucket   int;
begin
  select count(*) into v_sections from sections where kind in ('writing', 'speaking');
  select count(*) into v_tests    from section_results where kind in ('writing', 'speaking');
  select count(*) into v_progress from user_progress   where kind in ('writing', 'speaking');
  select count(*) into v_tables   from information_schema.tables
   where table_schema = 'public'
     and table_name in ('writing_submissions', 'speaking_submissions');
  select count(*) into v_funcs from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('finalise_writing_session', 'finalise_speaking_session', 'round_half_band');
  select count(*) into v_views from information_schema.views
   where table_schema = 'public' and table_name in ('result_writing', 'result_speaking');
  select count(*) into v_bucket from storage.buckets where id = 'speaking';

  if v_sections + v_tests + v_progress + v_tables + v_funcs + v_views + v_bucket > 0 then
    raise exception
      '0017 incomplete: % sections, % section_results, % user_progress, % tables, % functions, % views, % buckets',
      v_sections, v_tests, v_progress, v_tables, v_funcs, v_views, v_bucket;
  end if;
end;
$check$;

commit;
