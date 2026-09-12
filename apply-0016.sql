-- ════════════════════════════════════════════════════════════════════
--  Apply migration 0016 and prove it took effect.
--  Paste this whole block into the Supabase SQL editor and run it.
-- ════════════════════════════════════════════════════════════════════

-- 1. Prerequisites. If any row says false, an earlier migration is missing
--    too, and that has to be fixed before this function can work.
select
  to_regclass('public.test_sessions') is not null        as has_test_sessions,
  to_regclass('public.tests')         is not null        as has_tests,
  to_regclass('public.sections')      is not null        as has_sections,
  to_regproc('public.can_read_unpublished()') is not null as has_can_read_unpublished,
  'abandoned' = any (enum_range(null::session_status)::text[]) as has_abandoned_status;

-- 2. The function itself.
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

-- 3. Tell PostgREST about it. This is the step that is easy to miss: the API
--    caches function signatures, so a function created in the SQL editor can
--    still answer "Could not find the function ... in the schema cache" until
--    the cache is reloaded.
notify pgrst, 'reload schema';

-- 4. Proof. Expect exactly one row.
select
  p.proname                                as function,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef                              as security_definer,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_may_call
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'start_or_resume_session';
