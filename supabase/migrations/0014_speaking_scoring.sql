-- 0014_speaking_scoring
--
-- Makes a speaking paper recordable and scoreable, on the same terms as
-- writing. The shape is deliberately identical to migration 0012, because two
-- productive skills with two different mechanisms would be two things to get
-- wrong rather than one.
--
-- Three criteria, not four. IELTS marks Fluency and coherence, Lexical
-- resource, Grammatical range and accuracy, and Pronunciation. We do not score
-- pronunciation: judging it from a compressed browser recording, against no
-- calibrated reference, would be a number with nothing behind it. The UI says
-- so plainly, and this schema has no column for it, so the claim and the
-- storage agree.
--
-- What a student may write: the recording and how long it ran. Everything the
-- band rests on — the transcript, the metrics, the criteria — is written by
-- the evaluator running as the service role.

-- ------------------------------------------------- band is derived, not set
alter table speaking_submissions
  add column fluency_coherence numeric(2,1),
  add column lexical_resource  numeric(2,1),
  add column grammatical_range numeric(2,1);

alter table speaking_submissions drop column band;
alter table speaking_submissions
  add column band numeric(2,1)
  generated always as (
    round_half_band((fluency_coherence + lexical_resource + grammatical_range) / 3)
  ) stored;

comment on column speaking_submissions.band is
  'Derived from the three criteria we actually assess. Generated, so it can never be set directly or drift from them. Pronunciation is deliberately not among them.';

alter table speaking_submissions add constraint speaking_criteria_are_bands check (
  (fluency_coherence is null or (fluency_coherence between 0 and 9 and fluency_coherence * 2 = floor(fluency_coherence * 2)))
  and (lexical_resource  is null or (lexical_resource  between 0 and 9 and lexical_resource  * 2 = floor(lexical_resource  * 2)))
  and (grammatical_range is null or (grammatical_range between 0 and 9 and grammatical_range * 2 = floor(grammatical_range * 2)))
);

-- One recording per part per session, so a re-record replaces rather than stacks.
create unique index speaking_submissions_one_per_part
  on speaking_submissions (session_id, part);

-- --------------------------------------------------------- column privileges
revoke insert, update on speaking_submissions from authenticated;
grant insert (session_id, user_id, section_id, part, audio_path, duration_seconds)
  on speaking_submissions to authenticated;
grant update (audio_path, duration_seconds)
  on speaking_submissions to authenticated;

-- ------------------------------------------------------------- the finaliser
create or replace function finalise_speaking_session(p_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session   test_sessions%rowtype;
  v_result_id uuid;
  v_parts     integer;
  v_banded    integer;
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

  -- Every part of the interview must have been assessed. A band from two
  -- parts of three is not a speaking band, and inventing the third would be a
  -- fabricated score.
  select count(*), count(band) into v_parts, v_banded
    from speaking_submissions where session_id = p_session_id;

  if v_parts = 0 then
    raise exception 'This session has no recordings.';
  end if;
  if v_banded <> v_parts then
    raise exception 'Every part must be assessed before this interview can be finalised.';
  end if;
  if v_parts <> (select count(*) from sections s where s.test_id = v_session.test_id and s.kind = 'speaking') then
    raise exception 'One or more parts of this interview was never recorded.';
  end if;

  -- The parts are equal samples of the same conversation, so they weigh the same.
  select round_half_band(avg(band)) into v_overall
    from speaking_submissions where session_id = p_session_id;

  v_elapsed := greatest(0, extract(epoch from (now() - v_session.started_at))::integer);

  insert into test_results (session_id, user_id, overall_band, total_time_seconds)
  values (p_session_id, v_session.user_id, v_overall, v_elapsed)
  returning id into v_result_id;

  -- A per-part band is a real reading of a real sample, so it is stored, the
  -- same way a per-task writing band is.
  insert into section_results (result_id, section_id, kind, raw_score, raw_total, band, time_seconds)
  select v_result_id, ss.section_id, 'speaking', null, null, ss.band, ss.duration_seconds
    from speaking_submissions ss
   where ss.session_id = p_session_id
   order by ss.part;

  insert into user_progress (user_id, kind, band, result_id)
  values (v_session.user_id, 'speaking', v_overall, v_result_id);

  update test_sessions
     set status = 'submitted', submitted_at = now()
   where id = p_session_id;

  return v_result_id;
end;
$$;

revoke all on function finalise_speaking_session(uuid) from public;
grant execute on function finalise_speaking_session(uuid) to authenticated;

comment on function finalise_speaking_session(uuid) is
  'Freezes an assessed speaking session owned by the caller. Writes test_results, section_results and user_progress, sets status to submitted, returns the result id. Raises unless every part of the interview has been recorded and assessed.';

-- ------------------------------------------------------------- the read model
create view result_speaking with (security_invoker = false) as
  select
    tr.id                     as result_id,
    tr.user_id,
    ss.id                     as submission_id,
    ss.section_id,
    ss.part,
    ss.transcript,
    ss.duration_seconds,
    ss.metrics,
    ss.fluency_coherence,
    ss.lexical_resource,
    ss.grammatical_range,
    ss.band                   as part_band,
    tr.overall_band,
    s.stimulus ->> 'title'    as part_title
  from test_results tr
  join test_sessions ts on ts.id = tr.session_id
  join speaking_submissions ss on ss.session_id = ts.id
  join sections s on s.id = ss.section_id
  where tr.user_id = auth.uid();

grant select on result_speaking to authenticated;

comment on view result_speaking is
  'Per-part speaking detail for a completed result, owner-scoped. The overall band is the stored one, never recomputed by a caller.';

-- ------------------------------------------------------------ the recordings
-- Private, like the listening bucket. A student uploads under their own uid
-- and can read nothing else; the evaluator reads as the service role.
insert into storage.buckets (id, name, public)
values ('speaking', 'speaking', false)
on conflict (id) do nothing;

create policy "write own speaking recording"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'speaking' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "replace own speaking recording"
  on storage.objects for update to authenticated
  using (bucket_id = 'speaking' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'speaking' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "read own speaking recording"
  on storage.objects for select to authenticated
  using (bucket_id = 'speaking' and (storage.foldername(name))[1] = auth.uid()::text);
