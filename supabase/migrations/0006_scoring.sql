-- 0006_scoring
--
-- Supersedes the scorer introduced in 0005. Numbered 0006 rather than 0003
-- because 0003 through 0005 are already applied to the project and renumbering
-- applied migrations would break history. Nothing from 0005 survives except by
-- being replaced here.
--
-- Changes from 0005:
--   * Matching is a two-stage ladder: exact first, then normalised.
--   * Re-invoking on a submitted session raises instead of returning the
--     existing result id.
--   * section_results.band is always NULL for reading and listening. The band
--     is computed over the whole 40-question paper and lives on test_results
--     and user_progress. Per-section rows carry raw counts, time and
--     accuracy_by_type only.
--
-- raw_to_band() here must stay identical to rawToBand() in
-- src/lib/scoring/raw-to-band.ts. src/lib/scoring/raw-to-band.test.ts walks
-- every raw score and fails if they diverge.

-- Casefold and collapse whitespace. Used only by the second stage of matching.
create or replace function normalise_answer(raw text)
returns text
language sql
immutable
as $$
  select nullif(btrim(regexp_replace(lower(btrim(coalesce(raw, ''))), '\s+', ' ', 'g'), ' .,;:!?"''`'), '');
$$;

/*
 * Matching ladder.
 *
 *   1. Exact string equality against correct_answer.
 *   2. Case-insensitive, whitespace-normalised equality against the accepted
 *      variants.
 *
 * Assumption worth checking: stage 2 also considers correct_answer, not only
 * the variant list. Without that, a student who types "roman army" for the key
 * "Roman army" is marked wrong unless someone remembered to list the lowercase
 * form as a variant. Real IELTS marking is not case-sensitive, and the answer
 * keys in content/raw/ do not enumerate case variants. Narrow this to variants
 * only if the stricter reading is what you want.
 */
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
  v_raw     text;
begin
  if submitted is null or correct is null then
    return false;
  end if;

  -- multi_select: both sides are sets, compared normalised element by element.
  if qtype = 'multi_select' then
    select coalesce(array_agg(normalise_answer(value #>> '{}') order by normalise_answer(value #>> '{}')), '{}')
      into v_given
      from jsonb_array_elements(case when jsonb_typeof(submitted) = 'array' then submitted else jsonb_build_array(submitted) end);
    select coalesce(array_agg(normalise_answer(value #>> '{}') order by normalise_answer(value #>> '{}')), '{}')
      into v_wanted
      from jsonb_array_elements(case when jsonb_typeof(correct) = 'array' then correct else jsonb_build_array(correct) end);
    return v_given = v_wanted and array_length(v_given, 1) is not null;
  end if;

  v_raw := submitted #>> '{}';
  if v_raw is null then
    return false;
  end if;

  -- Stage 1: exact.
  if v_raw = (correct #>> '{}') then
    return true;
  end if;

  -- Stage 2: normalised, against the key and its accepted variants.
  return normalise_answer(v_raw) is not null
     and normalise_answer(v_raw) = any (
       select normalise_answer(candidate)
         from unnest(array[correct #>> '{}'] || coalesce(variants, '{}'::text[])) as candidate
     );
end;
$$;

-- Must mirror src/lib/scoring/raw-to-band.ts exactly.
create or replace function raw_to_band(raw integer, total integer, kind section_kind)
returns numeric
language plpgsql
immutable
as $$
declare
  scaled integer;
begin
  if raw is null or total is null or total <= 0 then return null; end if;

  -- Integer half-up rounding, matching scaleToForty() in TypeScript.
  scaled := (raw * 80 + total) / (total * 2);

  if kind = 'listening' then
    return case
      when scaled >= 39 then 9.0 when scaled >= 37 then 8.5 when scaled >= 35 then 8.0
      when scaled >= 32 then 7.5 when scaled >= 30 then 7.0 when scaled >= 26 then 6.5
      when scaled >= 23 then 6.0 when scaled >= 18 then 5.5 when scaled >= 16 then 5.0
      when scaled >= 13 then 4.5 when scaled >= 11 then 4.0 when scaled >= 8  then 3.5
      when scaled >= 6  then 3.0 when scaled >= 4  then 2.5 when scaled >= 2  then 2.0
      when scaled >= 1  then 1.0 else 0.0 end;
  end if;

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
  v_session    test_sessions%rowtype;
  v_result_id  uuid;
  v_total_time integer;
  v_overall    numeric(2,1);
begin
  select * into v_session from test_sessions where id = p_session_id;
  if not found then
    raise exception 'session % not found', p_session_id
      using errcode = 'no_data_found';
  end if;

  if v_session.user_id <> auth.uid() then
    raise exception 'session % does not belong to the caller', p_session_id
      using errcode = 'insufficient_privilege';
  end if;

  -- Re-invocation is an error, not a second scoring run. Nothing is written.
  if v_session.status <> 'in_progress' then
    raise exception 'session % is already %, and cannot be scored again', p_session_id, v_session.status
      using errcode = 'invalid_parameter_value';
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
  -- band is deliberately NULL: a reading or listening band is defined over the
  -- whole 40-question paper, so a per-passage band would be a number with no
  -- meaning. These rows exist for the raw counts, the timing and the per-type
  -- accuracy the results view needs.
  insert into section_results (result_id, section_id, kind, raw_score, raw_total, band, time_seconds, accuracy_by_type)
  select
    v_result_id,
    s.id,
    s.kind,
    count(*) filter (where a.is_correct),
    count(q.id),
    null,
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
  -- An unanswered question is a mistake too, which is what the left join gives.
  insert into mistakes (result_id, user_id, question_id, question_type, user_answer, correct_answer, time_spent_seconds)
  select v_result_id, v_session.user_id, q.id, q.type, a.value, q.correct_answer, a.time_spent_seconds
    from questions q
    join question_groups g on g.id = q.group_id
    join sections s on s.id = g.section_id
    left join answers a on a.question_id = q.id and a.session_id = p_session_id
   where s.test_id = v_session.test_id
     and coalesce(a.is_correct, false) = false;

  -- ---------------------------------------------------------- skill bands
  -- One band per skill, over every question of that skill in the paper. Also
  -- one row per kind rather than per section, because user_progress is keyed
  -- on (user_id, kind, recorded_at) and one insert shares a timestamp.
  insert into user_progress (user_id, kind, band, result_id)
  select v_session.user_id, t.kind, raw_to_band(t.raw, t.total, t.kind), v_result_id
    from (
      select kind, sum(raw_score)::integer as raw, sum(raw_total)::integer as total
        from section_results
       where result_id = v_result_id
       group by kind
    ) t
   where raw_to_band(t.raw, t.total, t.kind) is not null;

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
  'Marks and freezes an in-progress session owned by the caller. Writes test_results, section_results, mistakes and user_progress, sets status to submitted, returns the result id. Raises on a session that is not in_progress.';
