-- 0005_score_session
--
-- The authoritative scorer. submit.ts calls this and nothing else; the browser
-- never sees correct_answer, so a score cannot be forged by editing client
-- state. Runs as security definer because it must read `questions`, which has
-- no select policy for anyone.
--
-- Deterministic only. No AI, no heuristics beyond answer normalisation. The
-- explanation layer reads the `mistakes` rows this writes, later and
-- separately.

-- Casefold, collapse whitespace, drop surrounding punctuation. This is the
-- whole tolerance model: a student who typed "  Roman Army " is correct, one
-- who typed "the Roman army" is not unless the key says so.
create or replace function normalise_answer(raw text)
returns text
language sql
immutable
as $$
  select nullif(btrim(regexp_replace(lower(btrim(coalesce(raw, ''))), '\s+', ' ', 'g'), ' .,;:!?"''`'), '');
$$;

-- True when the student's answer matches the key or any accepted variant.
create or replace function answer_matches(
  submitted jsonb,
  correct jsonb,
  variants text[],
  qtype question_type
)
returns boolean
language plpgsql
immutable
as $$
declare
  v_given   text[];
  v_wanted  text[];
begin
  if submitted is null or correct is null then
    return false;
  end if;

  -- multi_select: both sides are sets and every element must line up.
  if qtype = 'multi_select' then
    select coalesce(array_agg(normalise_answer(value #>> '{}') order by normalise_answer(value #>> '{}')), '{}')
      into v_given
      from jsonb_array_elements(case when jsonb_typeof(submitted) = 'array' then submitted else jsonb_build_array(submitted) end);
    select coalesce(array_agg(normalise_answer(value #>> '{}') order by normalise_answer(value #>> '{}')), '{}')
      into v_wanted
      from jsonb_array_elements(case when jsonb_typeof(correct) = 'array' then correct else jsonb_build_array(correct) end);
    return v_given = v_wanted and array_length(v_given, 1) is not null;
  end if;

  -- Everything else is a single value compared against the key plus variants.
  return normalise_answer(submitted #>> '{}') is not null
     and normalise_answer(submitted #>> '{}') = any (
       select normalise_answer(candidate)
         from unnest(array[correct #>> '{}'] || coalesce(variants, '{}'::text[])) as candidate
     );
end;
$$;

-- Raw score to band. Reading and Listening use the published 40-question
-- tables; a section with a different question count is scaled to a 40-question
-- equivalent first, which makes the band an estimate and is why the UI must
-- call it one.
create or replace function raw_to_band(raw integer, total integer, kind section_kind)
returns numeric
language plpgsql
immutable
as $$
declare
  scaled integer;
begin
  if total is null or total <= 0 or raw is null then return null; end if;
  scaled := round(raw::numeric * 40 / total);

  if kind = 'listening' then
    return case
      when scaled >= 39 then 9.0 when scaled >= 37 then 8.5 when scaled >= 35 then 8.0
      when scaled >= 32 then 7.5 when scaled >= 30 then 7.0 when scaled >= 26 then 6.5
      when scaled >= 23 then 6.0 when scaled >= 18 then 5.5 when scaled >= 16 then 5.0
      when scaled >= 13 then 4.5 when scaled >= 11 then 4.0 when scaled >= 8  then 3.5
      when scaled >= 6  then 3.0 when scaled >= 4  then 2.5 when scaled >= 2  then 2.0
      when scaled >= 1  then 1.0 else 0.0 end;
  end if;

  -- Academic Reading.
  return case
    when scaled >= 39 then 9.0 when scaled >= 37 then 8.5 when scaled >= 35 then 8.0
    when scaled >= 33 then 7.5 when scaled >= 30 then 7.0 when scaled >= 27 then 6.5
    when scaled >= 23 then 6.0 when scaled >= 19 then 5.5 when scaled >= 15 then 5.0
    when scaled >= 13 then 4.5 when scaled >= 10 then 4.0 when scaled >= 8  then 3.5
    when scaled >= 6  then 3.0 when scaled >= 4  then 2.5 when scaled >= 2  then 2.0
    when scaled >= 1  then 1.0 else 0.0 end;
end;
$$;

create or replace function score_session(p_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session   test_sessions%rowtype;
  v_result_id uuid;
  v_total_time integer;
  v_overall   numeric(2,1);
begin
  select * into v_session from test_sessions where id = p_session_id;
  if not found then
    raise exception 'session % not found', p_session_id using errcode = 'no_data_found';
  end if;
  if v_session.user_id <> auth.uid() then
    raise exception 'session % does not belong to the caller', p_session_id using errcode = 'insufficient_privilege';
  end if;

  -- Submitting twice must not double-write. Hand back the existing result.
  if v_session.status <> 'in_progress' then
    select id into v_result_id from test_results where session_id = p_session_id;
    if v_result_id is not null then return v_result_id; end if;
    raise exception 'session % is %, and has no result', p_session_id, v_session.status;
  end if;

  -- ---------------------------------------------------------------- marking
  update answers a
     set is_correct = answer_matches(a.value, q.correct_answer, q.accepted_variants, q.type)
    from questions q
   where q.id = a.question_id
     and a.session_id = p_session_id;

  v_total_time := greatest(0, extract(epoch from (now() - v_session.started_at))::integer);

  insert into test_results (session_id, user_id, overall_band, total_time_seconds)
  values (p_session_id, v_session.user_id, null, v_total_time)
  returning id into v_result_id;

  -- ------------------------------------------------------- per-section rows
  insert into section_results (result_id, section_id, kind, raw_score, raw_total, band, time_seconds, accuracy_by_type)
  select
    v_result_id,
    s.id,
    s.kind,
    count(*) filter (where a.is_correct),
    count(q.id),
    raw_to_band(count(*) filter (where a.is_correct)::integer, count(q.id)::integer, s.kind),
    coalesce(sum(a.time_spent_seconds), 0)::integer,
    coalesce(
      (select jsonb_object_agg(t.type, jsonb_build_object('correct', t.correct, 'total', t.total))
         from (
           select q2.type::text as type,
                  count(*) filter (where a2.is_correct) as correct,
                  count(*) as total
             from questions q2
             join question_groups g2 on g2.id = q2.group_id
             left join answers a2 on a2.question_id = q2.id and a2.session_id = p_session_id
            where g2.section_id = s.id
            group by q2.type
         ) t),
      '{}'::jsonb)
  from sections s
  join question_groups g on g.section_id = s.id
  join questions q on q.group_id = g.id
  left join answers a on a.question_id = q.id and a.session_id = p_session_id
  where s.test_id = v_session.test_id
  group by s.id, s.kind;

  -- ------------------------------------------------------------- mistakes
  -- An unanswered question is a mistake too; that is what left join gives us.
  insert into mistakes (result_id, user_id, question_id, question_type, user_answer, correct_answer, time_spent_seconds)
  select v_result_id, v_session.user_id, q.id, q.type, a.value, q.correct_answer, a.time_spent_seconds
    from questions q
    join question_groups g on g.id = q.group_id
    join sections s on s.id = g.section_id
    left join answers a on a.question_id = q.id and a.session_id = p_session_id
   where s.test_id = v_session.test_id
     and coalesce(a.is_correct, false) = false;

  -- ----------------------------------------------------- per-skill bands
  -- IELTS scores a skill on the whole paper, not passage by passage: reading
  -- is one band out of 40 questions, not the mean of three passage bands. So
  -- aggregate the raw counts per section_kind first, then convert once.
  -- section_results.band stays as a per-passage indicator for the results UI.
  --
  -- This also has to be one row per kind rather than one per section, because
  -- user_progress is keyed on (user_id, kind, recorded_at) and every row an
  -- insert writes shares the same statement timestamp.
  insert into user_progress (user_id, kind, band, result_id)
  select v_session.user_id,
         t.kind,
         raw_to_band(t.raw, t.total, t.kind),
         v_result_id
    from (
      select kind, sum(raw_score)::integer as raw, sum(raw_total)::integer as total
        from section_results
       where result_id = v_result_id
       group by kind
    ) t
   where raw_to_band(t.raw, t.total, t.kind) is not null;

  -- Overall is the mean of the per-skill bands, rounded to the nearest half.
  select round(avg(band) * 2) / 2 into v_overall
    from user_progress
   where result_id = v_result_id;

  update test_results set overall_band = v_overall where id = v_result_id;

  update test_sessions
     set status = 'submitted', submitted_at = now()
   where id = p_session_id;

  return v_result_id;
end;
$$;

revoke all on function score_session(uuid) from public, anon;
grant execute on function score_session(uuid) to authenticated;

comment on function score_session(uuid) is
  'Freezes and marks a session, writes test_results/section_results/mistakes/user_progress, returns the result id. The only place a score is produced.';
