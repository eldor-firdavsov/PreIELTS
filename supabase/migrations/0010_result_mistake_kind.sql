-- 0010_result_mistake_kind
--
-- Adds the section's skill to result_mistakes.
--
-- The results page has to treat a listening mistake differently from a reading
-- one: the stored evidence is a transcript moment rather than a passage offset,
-- and the "Why was I wrong?" Edge Function is reading-only, so offering it on a
-- listening question would promise an explanation built from a passage that
-- does not exist. Which of those applies is a fact about the row, so the row
-- carries it, rather than the page inferring it by matching section ids against
-- another query's results.
--
-- The column is appended, which is the only shape `create or replace view`
-- accepts. The owner-scoped filter is unchanged and still the only thing
-- protecting this view: `m.user_id = auth.uid()`, on a view that reaches
-- `questions`, which nobody may select.

create or replace view result_mistakes with (security_invoker = false) as
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
    case
      when ov.avg_seconds_per_question is null or ov.avg_seconds_per_question = 0
        then null
      else round(m.time_spent_seconds::numeric / ov.avg_seconds_per_question, 2)
    end                             as time_vs_average,
    s.kind                          as section_kind
  from mistakes m
  join questions q on q.id = m.question_id
  join question_groups g on g.id = q.group_id
  join sections s on s.id = g.section_id
  join result_overview ov on ov.result_id = m.result_id
  where m.user_id = auth.uid();
