-- 0008_result_average_basis
--
-- Fixes the basis of avg_seconds_per_question.
--
-- It was total_time_seconds (wall clock from started_at to submit) divided by
-- the question count. But SPEC.md §9 compares a question's time against that
-- average, and a question's time_spent_seconds is measured by the engine while
-- the student is actually on that question. Dividing one clock by the question
-- count and comparing it to the other produces a ratio that means nothing:
-- wall clock includes reading the passage, re-reading, and idling.
--
-- The average now comes from the same clock as the numerator, the summed
-- per-section recorded time. total_time_seconds stays wall clock, because
-- "how long did this take you" is a wall-clock question.
create or replace view result_overview with (security_invoker = false) as
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
    case when agg.raw_total > 0 and agg.answered_seconds > 0
         then round(agg.answered_seconds::numeric / agg.raw_total)
    end                                       as avg_seconds_per_question
  from test_results tr
  join test_sessions ts on ts.id = tr.session_id
  join tests t on t.id = ts.test_id
  join lateral (
    select coalesce(sum(sr.raw_score), 0)    as raw_score,
           coalesce(sum(sr.raw_total), 0)    as raw_total,
           coalesce(sum(sr.time_seconds), 0) as answered_seconds
      from section_results sr
     where sr.result_id = tr.id
  ) agg on true
  where tr.user_id = auth.uid();
