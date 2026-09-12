-- 0015_study_plan_inputs
--
-- The deterministic half of the long-term analysis, and the reason the model
-- never sees a test history.
--
-- SPEC.md §17: perform the deterministic analysis first, store structured data,
-- and send only that. This function is that step. It reduces everything the
-- student has ever done — every marked paper, every question type, every
-- section, every writing criterion, every speaking metric — to one small jsonb
-- document of counts and stored bands. No passage, no essay, no transcript and
-- no question prompt is in it. What the study-plan Edge Function sends to
-- Gemini is exactly what comes out of here.
--
-- Security definer with its own `user_id = auth.uid()` filter, on the same
-- terms as the result_* views in migration 0007: bypassing RLS is the point,
-- because the counts join `questions`, which no one may select. The filter is
-- the only thing protecting these rows, so it appears in every branch below and
-- the function refuses outright when there is no caller.
--
-- It also returns a `fingerprint`: a digest of the caller's id and of the
-- inputs themselves. That is the cache key. Two requests over unchanged data
-- produce the same fingerprint and so the same `ai_analyses` row, which is
-- returned without a model call; one more completed test changes the inputs,
-- changes the fingerprint, and asks for a new plan. The old row is never
-- mutated, so the advice a student was given last month remains readable
-- alongside the numbers it was given for.

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
  ),

  -- The writing criteria, averaged over every task that carries a band. An
  -- average of criteria is a description of a habit, not a band: it is never
  -- shown as one, and the plan is told as much.
  writing as (
    select count(*)                              as tasks_marked,
           round(avg(w.task_response), 1)        as mean_task_response,
           round(avg(w.coherence_cohesion), 1)   as mean_coherence_cohesion,
           round(avg(w.lexical_resource), 1)     as mean_lexical_resource,
           round(avg(w.grammatical_range), 1)    as mean_grammatical_range,
           round(avg(w.word_count))              as mean_word_count,
           count(*) filter (
             where (s.stimulus ->> 'min_words') ~ '^[0-9]+$'
               and w.word_count < (s.stimulus ->> 'min_words')::int
           )                                     as under_minimum
      from writing_submissions w
      join sections s on s.id = w.section_id
     where w.user_id = v_uid and w.band is not null
  ),

  -- The speaking criteria and the countable facts about delivery. Every metric
  -- was computed once by the evaluator and stored; none is recomputed here.
  speaking as (
    select count(*)                              as parts_assessed,
           round(avg(sp.fluency_coherence), 1)   as mean_fluency_coherence,
           round(avg(sp.lexical_resource), 1)    as mean_lexical_resource,
           round(avg(sp.grammatical_range), 1)   as mean_grammatical_range,
           round(avg((sp.metrics ->> 'wpm')::numeric), 1)          as mean_words_per_minute,
           round(avg((sp.metrics ->> 'ttr')::numeric), 3)          as mean_type_token_ratio,
           round(avg((sp.metrics ->> 'filler_total')::numeric), 1) as mean_fillers_per_part,
           round(avg((sp.metrics ->> 'long_pauses')::numeric), 1)  as mean_long_pauses_per_part
      from speaking_submissions sp
     where sp.user_id = v_uid
       and sp.band is not null
       and jsonb_typeof(sp.metrics) = 'object'
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
        from timing ti),
    'writing', (
      select jsonb_build_object(
               'tasks_marked',            wr.tasks_marked,
               'mean_task_response',      wr.mean_task_response,
               'mean_coherence_cohesion', wr.mean_coherence_cohesion,
               'mean_lexical_resource',   wr.mean_lexical_resource,
               'mean_grammatical_range',  wr.mean_grammatical_range,
               'mean_word_count',         wr.mean_word_count,
               'tasks_under_minimum',     wr.under_minimum)
        from writing wr),
    'speaking', (
      select jsonb_build_object(
               'parts_assessed',             sp.parts_assessed,
               'mean_fluency_coherence',     sp.mean_fluency_coherence,
               'mean_lexical_resource',      sp.mean_lexical_resource,
               'mean_grammatical_range',     sp.mean_grammatical_range,
               'mean_words_per_minute',      sp.mean_words_per_minute,
               'mean_type_token_ratio',      sp.mean_type_token_ratio,
               'mean_fillers_per_part',      sp.mean_fillers_per_part,
               'mean_long_pauses_per_part',  sp.mean_long_pauses_per_part)
        from speaking sp)
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
