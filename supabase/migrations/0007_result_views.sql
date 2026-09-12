-- 0007_result_views
--
-- Read models for the results page. The page renders these rows and does no
-- arithmetic of its own: percentages, averages and the "slower than your
-- average" comparison are all computed here, so the numbers a student sees are
-- the numbers the database computed, once.
--
-- Every view is security definer (security_invoker off) and carries its own
-- `user_id = auth.uid()` filter. That is deliberate and it is the only thing
-- protecting these rows, because bypassing RLS is the point: the views join
-- `questions`, which has no select policy for anyone, to reach prompts and
-- evidence. Correct answers reach a student only after their own submission,
-- through `mistakes`, which already stores them per result.

-- One row per result. Totals across the whole paper.
create view result_overview with (security_invoker = false) as
  select
    tr.id                                     as result_id,
    tr.user_id,
    tr.overall_band,
    tr.total_time_seconds,
    tr.created_at,
    ts.id                                     as session_id,
    ts.test_id,
    t.title                                   as test_title,
    t.external_id,
    agg.raw_score,
    agg.raw_total,
    case when agg.raw_total > 0
         then round(agg.raw_score::numeric * 100 / agg.raw_total)
    end                                       as percent_correct,
    case when agg.raw_total > 0
         then round(tr.total_time_seconds::numeric / agg.raw_total)
    end                                       as avg_seconds_per_question
  from test_results tr
  join test_sessions ts on ts.id = tr.session_id
  join tests t on t.id = ts.test_id
  join lateral (
    select coalesce(sum(sr.raw_score), 0) as raw_score,
           coalesce(sum(sr.raw_total), 0) as raw_total
      from section_results sr
     where sr.result_id = tr.id
  ) agg on true
  where tr.user_id = auth.uid();

-- One row per skill. This is where a band lives; section_results.band is NULL
-- by design because a band is defined over the whole paper.
create view result_skill_bands with (security_invoker = false) as
  select
    up.result_id,
    up.user_id,
    up.kind,
    up.band,
    agg.raw_score,
    agg.raw_total,
    case when agg.raw_total > 0
         then round(agg.raw_score::numeric * 100 / agg.raw_total)
    end as percent_correct
  from user_progress up
  join lateral (
    select coalesce(sum(sr.raw_score), 0) as raw_score,
           coalesce(sum(sr.raw_total), 0) as raw_total
      from section_results sr
     where sr.result_id = up.result_id and sr.kind = up.kind
  ) agg on true
  where up.user_id = auth.uid() and up.result_id is not null;

-- Accuracy by passage, one row per section. SPEC.md §8.
create view result_sections with (security_invoker = false) as
  select
    sr.result_id,
    tr.user_id,
    sr.section_id,
    s.ordinal                       as section_ordinal,
    s.kind,
    s.stimulus ->> 'title'          as section_title,
    sr.raw_score,
    sr.raw_total,
    case when sr.raw_total > 0
         then round(sr.raw_score::numeric * 100 / sr.raw_total)
    end                             as percent_correct,
    sr.time_seconds,
    sr.accuracy_by_type
  from section_results sr
  join test_results tr on tr.id = sr.result_id
  join sections s on s.id = sr.section_id
  where tr.user_id = auth.uid();

-- Accuracy by question type across the whole paper, not per section.
create view result_type_accuracy with (security_invoker = false) as
  select
    tr.id                                   as result_id,
    tr.user_id,
    q.type                                  as question_type,
    count(*)                                as total,
    count(*) filter (where a.is_correct)    as correct,
    round(count(*) filter (where a.is_correct)::numeric * 100 / count(*)) as percent_correct
  from test_results tr
  join test_sessions ts on ts.id = tr.session_id
  join sections s on s.test_id = ts.test_id
  join question_groups g on g.section_id = s.id
  join questions q on q.group_id = g.id
  left join answers a on a.question_id = q.id and a.session_id = ts.id
  where tr.user_id = auth.uid()
  group by tr.id, tr.user_id, q.type;

-- Every incorrect or unanswered question, with what the results page shows.
--
-- `evidence` is the stored passage offset where one exists. It is not derived
-- and not guessed: a question without a marker reports has_evidence false and
-- the UI disables "Show answer in passage" rather than highlighting something
-- it cannot locate.
create view result_mistakes with (security_invoker = false) as
  select
    m.id                            as mistake_id,
    m.result_id,
    m.user_id,
    m.question_id,
    m.question_type,
    m.user_answer,
    m.correct_answer,
    m.time_spent_seconds,
    q.ordinal                       as question_ordinal,
    q.prompt,
    q.options,
    q.evidence,
    (q.evidence ->> 'kind') is not null              as has_evidence,
    g.instructions                  as group_instructions,
    s.id                            as section_id,
    s.ordinal                       as section_ordinal,
    s.stimulus ->> 'title'          as section_title,
    ov.avg_seconds_per_question,
    -- SPEC.md §9: the comparison the time analysis is built on, computed once
    -- here so the page states a fact rather than deriving one.
    case
      when ov.avg_seconds_per_question is null or ov.avg_seconds_per_question = 0
        then null
      else round(m.time_spent_seconds::numeric / ov.avg_seconds_per_question, 2)
    end                             as time_vs_average
  from mistakes m
  join questions q on q.id = m.question_id
  join question_groups g on g.id = q.group_id
  join sections s on s.id = g.section_id
  join result_overview ov on ov.result_id = m.result_id
  where m.user_id = auth.uid();

grant select on result_overview, result_skill_bands, result_sections,
                result_type_accuracy, result_mistakes
  to authenticated;

comment on view result_mistakes is
  'Per-question detail for a completed result, owner-scoped. Exposes correct_answer, which is legitimate only after submission.';
