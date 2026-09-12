-- 0016_session_lifecycle
--
-- Starting or resuming a session becomes one database call, and a paper whose
-- clock ran out stops being resumable.
--
-- The bug this fixes. `startOrResumeSession` in the client resumed the newest
-- in_progress session for a test with no regard for its age, and nothing in the
-- system had ever written any status but 'submitted'. Both 'abandoned' and
-- 'expired' were declared in 0001 and never used. So a test opened and walked
-- away from stayed in_progress for ever, and opening it again resumed it:
-- the countdown derives from started_at and came back at zero, every renderer
-- was disabled, and the paper could not be sat. Listening was worst, because
-- `ListeningPlayer` anchors playback to the same started_at and therefore
-- reported a recording that had finished before the student pressed play.
-- Once a test went stale for a student it was dead for that student for ever,
-- with nothing in the interface offering a way out.
--
-- The rule. A session is resumable while its own clock still has time in it,
-- plus a grace window. Past that the paper is over and a fresh one is started.
-- The grace exists for the case this must not break: a crash or a closed tab in
-- the last minute of a paper, where reloading has to give the student their
-- work back so they can still submit it. Fifteen minutes is long enough for
-- that and far too short to hand back yesterday's paper.
--
-- Why 'abandoned' and not 'expired'. What we actually know is that the paper was
-- left unfinished past the point where finishing was possible. We do not know
-- the student meant to stop. 'expired' is left unused on purpose, for the state
-- a paper reaches when its time runs out *and* it is marked as it stands, which
-- is a different feature and a different decision.
--
-- The old session is never scored on the student's behalf. score_session writes
-- user_progress, and user_progress is what the study plan reasons from. Marking
-- an abandoned paper would put a band the student never sat into the record
-- that decides what they are told to practise next.
--
-- Security definer for the same reason as score_session: it decides a fact about
-- a session rather than trusting one the client asserts. Every statement filters
-- on auth.uid(), and the test has to be one the caller is allowed to read — the
-- same published-or-allowlisted rule that governs the content itself. Nothing
-- previously checked that, so a client could open a session against a test whose
-- questions it could not fetch.

create or replace function start_or_resume_session(p_test_id uuid)
returns test_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Long enough to survive a crash in the last minute of a paper; short enough
  -- that a paper left overnight is never handed back.
  c_grace_seconds constant integer := 900;

  v_uid     uuid := auth.uid();
  v_total   integer;
  v_session test_sessions;
begin
  if v_uid is null then
    raise exception 'start_or_resume_session requires a signed-in caller';
  end if;

  if not exists (
    select 1
      from tests t
     where t.id = p_test_id
       and (t.is_published or can_read_unpublished())
  ) then
    raise exception 'test % is not available to this caller', p_test_id
      using errcode = '42501';
  end if;

  -- The paper's own clock, from its own sections. The countdown in the client
  -- is the same sum, so the two can never disagree about when time is up.
  select coalesce(sum(s.duration_seconds), 0)
    into v_total
    from sections s
   where s.test_id = p_test_id;

  update test_sessions ts
     set status = 'abandoned'
   where ts.user_id = v_uid
     and ts.test_id = p_test_id
     and ts.status = 'in_progress'
     and ts.started_at + make_interval(secs => v_total + c_grace_seconds) < now();

  select *
    into v_session
    from test_sessions ts
   where ts.user_id = v_uid
     and ts.test_id = p_test_id
     and ts.status = 'in_progress'
   order by ts.started_at desc
   limit 1;

  if found then
    return v_session;
  end if;

  insert into test_sessions (user_id, test_id)
  values (v_uid, p_test_id)
  returning * into v_session;

  return v_session;
end;
$$;

comment on function start_or_resume_session(uuid) is
  'Resumes the caller''s in-progress session for a readable test, or starts one. A session whose clock ran out more than 15 minutes ago is marked abandoned rather than resumed, so a paper left unfinished never comes back with its countdown already at zero.';

revoke all on function start_or_resume_session(uuid) from public, anon;
grant execute on function start_or_resume_session(uuid) to authenticated;
