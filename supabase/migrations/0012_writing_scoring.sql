-- 0012_writing_scoring
--
-- Makes a writing paper scoreable, on the same terms as reading and listening:
-- the student writes the essay, the server decides the band, and the database
-- does the arithmetic once.
--
-- Three problems this solves.
--
-- 1. `own_writing` is `for all`, so a student could update their own row —
--    including `band`. Deterministic scoring is protected by having no client
--    write path at all; writing had one. Column privileges close it: a student
--    may write the essay, and nothing else.
--
-- 2. A band must not be a number anyone typed. `band` becomes a generated
--    column over the four criteria, so it cannot disagree with them and cannot
--    be set independently, by a client or by the evaluator.
--
-- 3. `score_session()` marks answers against an answer key, which a writing
--    paper does not have. Writing gets its own finaliser with the same
--    contract: owner-checked, in-progress only, raises on a second call.
--
-- The evaluator's Gemini credential is not stored here. It lives in the Edge
-- Function environment as GEMINI_API_KEY, which is where a credential belongs;
-- a secrets table would only be a worse copy of that.

-- ------------------------------------------------------------ band rounding
-- IELTS bands move in half steps. Immutable, because a generated column and
-- the parity test both depend on it never changing its mind.
create or replace function round_half_band(value numeric)
returns numeric
language sql
immutable
as $$
  select case
    when value is null then null
    else least(9.0, greatest(0.0, round(value * 2) / 2))
  end::numeric(2,1);
$$;

comment on function round_half_band(numeric) is
  'Rounds to the nearest half band and clamps to 0-9. The single definition of what a band is allowed to be.';

-- ------------------------------------------------- band is derived, not set
alter table writing_submissions drop column band;
alter table writing_submissions
  add column band numeric(2,1)
  generated always as (
    round_half_band((task_response + coherence_cohesion + lexical_resource + grammatical_range) / 4)
  ) stored;

comment on column writing_submissions.band is
  'Derived from the four criteria. Generated, so it can never be set directly or drift from them.';

-- Criteria are bands too, so hold them to the same shape.
alter table writing_submissions add constraint writing_criteria_are_bands check (
  (task_response      is null or (task_response      between 0 and 9 and task_response      * 2 = floor(task_response      * 2)))
  and (coherence_cohesion is null or (coherence_cohesion between 0 and 9 and coherence_cohesion * 2 = floor(coherence_cohesion * 2)))
  and (lexical_resource   is null or (lexical_resource   between 0 and 9 and lexical_resource   * 2 = floor(lexical_resource   * 2)))
  and (grammatical_range  is null or (grammatical_range  between 0 and 9 and grammatical_range  * 2 = floor(grammatical_range  * 2)))
);

-- One submission per task per session, so a resubmit updates rather than stacks.
create unique index writing_submissions_one_per_task
  on writing_submissions (session_id, task_number);

-- --------------------------------------------------------- column privileges
-- The student writes the essay. The criteria, and therefore the band, are
-- written by the evaluator running as the service role.
revoke insert, update on writing_submissions from authenticated;
grant insert (session_id, user_id, section_id, task_number, body, word_count, time_spent_seconds)
  on writing_submissions to authenticated;
grant update (body, word_count, time_spent_seconds)
  on writing_submissions to authenticated;

-- ------------------------------------------------------------- the finaliser
create or replace function finalise_writing_session(p_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session   test_sessions%rowtype;
  v_result_id uuid;
  v_task1     numeric;
  v_task2     numeric;
  v_overall   numeric;
  v_elapsed   integer;
begin
  select * into v_session from test_sessions where id = p_session_id for update;
  if not found then
    raise exception 'Session % does not exist.', p_session_id;
  end if;
  if v_session.user_id <> auth.uid() then
    raise exception 'That session belongs to someone else.';
  end if;
  if v_session.status <> 'in_progress' then
    raise exception 'Session % is already %.', p_session_id, v_session.status;
  end if;

  -- Both tasks must have been evaluated. Half a paper is not a writing band,
  -- and inventing one for the missing task would be a fabricated score.
  select max(case when task_number = 1 then band end),
         max(case when task_number = 2 then band end)
    into v_task1, v_task2
    from writing_submissions
   where session_id = p_session_id;

  if v_task1 is null or v_task2 is null then
    raise exception 'Both tasks must be evaluated before this paper can be finalised.';
  end if;

  -- The official weighting: Task 2 counts twice.
  v_overall := round_half_band((v_task1 + 2 * v_task2) / 3);
  v_elapsed := greatest(0, extract(epoch from (now() - v_session.started_at))::integer);

  insert into test_results (session_id, user_id, overall_band, total_time_seconds)
  values (p_session_id, v_session.user_id, v_overall, v_elapsed)
  returning id into v_result_id;

  -- A per-task band is real here, unlike a reading passage's, so it is stored.
  insert into section_results (result_id, section_id, kind, raw_score, raw_total, band, time_seconds)
  select v_result_id, ws.section_id, 'writing', null, null, ws.band, ws.time_spent_seconds
    from writing_submissions ws
   where ws.session_id = p_session_id
   order by ws.task_number;

  insert into user_progress (user_id, kind, band, result_id)
  values (v_session.user_id, 'writing', v_overall, v_result_id);

  update test_sessions
     set status = 'submitted', submitted_at = now()
   where id = p_session_id;

  return v_result_id;
end;
$$;

revoke all on function finalise_writing_session(uuid) from public;
grant execute on function finalise_writing_session(uuid) to authenticated;

comment on function finalise_writing_session(uuid) is
  'Freezes an evaluated writing session owned by the caller. Writes test_results, section_results and user_progress, sets status to submitted, returns the result id. Raises on a session that is not in_progress or whose tasks are not both evaluated.';

-- ------------------------------------------------------------- the read model
create view result_writing with (security_invoker = false) as
  select
    tr.id                    as result_id,
    tr.user_id,
    ws.id                    as submission_id,
    ws.section_id,
    ws.task_number,
    ws.body,
    ws.word_count,
    ws.time_spent_seconds,
    ws.task_response,
    ws.coherence_cohesion,
    ws.lexical_resource,
    ws.grammatical_range,
    ws.band                  as task_band,
    tr.overall_band,
    s.stimulus ->> 'title'   as task_title,
    s.stimulus ->> 'prompt'  as task_prompt
  from test_results tr
  join test_sessions ts on ts.id = tr.session_id
  join writing_submissions ws on ws.session_id = ts.id
  join sections s on s.id = ws.section_id
  where tr.user_id = auth.uid();

grant select on result_writing to authenticated;

comment on view result_writing is
  'Per-task writing detail for a completed result, owner-scoped. The overall band is the stored one, never recomputed by a caller.';
