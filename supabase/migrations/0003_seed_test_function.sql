-- 0003_seed_test_function
--
-- seed_test() upserts one whole normalized test from a single jsonb payload.
--
-- Why a function rather than statements from the client: a function call is one
-- transaction by definition, so a test lands whole or not at all no matter how
-- the caller reached the database. That holds over a direct Postgres connection
-- and over PostgREST, where a client cannot open a transaction of its own.
--
-- Idempotency: every upsert carries a WHERE clause on its DO UPDATE branch, so
-- a row whose values already match is not rewritten. Re-running with unchanged
-- input touches zero rows and creates no new row versions.
--
-- Rows for sections, groups and questions that are absent from the payload are
-- deleted, so a re-ingest that drops a question does not leave an orphan behind.
--
-- This is content administration, not a client-facing entry point. It runs as
-- security definer so a seed job can use it, and execute is granted only to
-- service_role, never to authenticated or anon.

create or replace function seed_test(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_test_id      uuid;
  v_section_id   uuid;
  v_group_id     uuid;
  v_section      jsonb;
  v_group        jsonb;
  v_question     jsonb;
  v_inserted     boolean;
  c_tests_ins    int := 0;
  c_tests_upd    int := 0;
  c_sec_ins      int := 0;
  c_sec_upd      int := 0;
  c_sec_del      int := 0;
  c_grp_ins      int := 0;
  c_grp_upd      int := 0;
  c_grp_del      int := 0;
  c_q_ins        int := 0;
  c_q_upd        int := 0;
  c_q_del        int := 0;
  v_deleted      int;
  v_keep         smallint[];
begin
  if payload ->> 'external_id' is null then
    raise exception 'payload has no external_id';
  end if;

  -- ---------------------------------------------------------------- test
  insert into tests (external_id, title, is_full_mock, is_published, source_provenance)
  values (
    payload ->> 'external_id',
    payload ->> 'title',
    coalesce((payload ->> 'is_full_mock')::boolean, false),
    coalesce((payload ->> 'is_published')::boolean, false),
    coalesce(payload -> 'source_provenance', '{}'::jsonb)
  )
  on conflict (external_id) do update
    set title             = excluded.title,
        is_full_mock      = excluded.is_full_mock,
        is_published      = excluded.is_published,
        source_provenance = excluded.source_provenance
  where tests.title             is distinct from excluded.title
     or tests.is_full_mock      is distinct from excluded.is_full_mock
     or tests.is_published      is distinct from excluded.is_published
     or tests.source_provenance is distinct from excluded.source_provenance
  returning id, (xmax = 0) into v_test_id, v_inserted;

  if v_test_id is null then
    select id into v_test_id from tests where external_id = payload ->> 'external_id';
  elsif v_inserted then
    c_tests_ins := 1;
  else
    c_tests_upd := 1;
  end if;

  -- ------------------------------------------------------------ sections
  for v_section in select * from jsonb_array_elements(payload -> 'sections') loop
    insert into sections (test_id, ordinal, kind, duration_seconds, stimulus)
    values (
      v_test_id,
      (v_section ->> 'ordinal')::smallint,
      (v_section ->> 'kind')::section_kind,
      (v_section ->> 'duration_seconds')::int,
      coalesce(v_section -> 'stimulus', '{}'::jsonb)
    )
    on conflict (test_id, ordinal) do update
      set kind             = excluded.kind,
          duration_seconds = excluded.duration_seconds,
          stimulus         = excluded.stimulus
    where sections.kind             is distinct from excluded.kind
       or sections.duration_seconds is distinct from excluded.duration_seconds
       or sections.stimulus         is distinct from excluded.stimulus
    returning id, (xmax = 0) into v_section_id, v_inserted;

    if v_section_id is null then
      select id into v_section_id from sections
       where test_id = v_test_id and ordinal = (v_section ->> 'ordinal')::smallint;
    elsif v_inserted then
      c_sec_ins := c_sec_ins + 1;
    else
      c_sec_upd := c_sec_upd + 1;
    end if;

    -- ------------------------------------------------------ question_groups
    for v_group in select * from jsonb_array_elements(v_section -> 'groups') loop
      insert into question_groups (section_id, ordinal, instructions, shared_options)
      values (
        v_section_id,
        (v_group ->> 'ordinal')::smallint,
        v_group ->> 'instructions',
        v_group -> 'shared_options'
      )
      on conflict (section_id, ordinal) do update
        set instructions   = excluded.instructions,
            shared_options = excluded.shared_options
      where question_groups.instructions   is distinct from excluded.instructions
         or question_groups.shared_options is distinct from excluded.shared_options
      returning id, (xmax = 0) into v_group_id, v_inserted;

      if v_group_id is null then
        select id into v_group_id from question_groups
         where section_id = v_section_id and ordinal = (v_group ->> 'ordinal')::smallint;
      elsif v_inserted then
        c_grp_ins := c_grp_ins + 1;
      else
        c_grp_upd := c_grp_upd + 1;
      end if;

      -- ------------------------------------------------------- questions
      for v_question in select * from jsonb_array_elements(v_group -> 'questions') loop
        insert into questions (group_id, ordinal, type, prompt, options,
                               correct_answer, accepted_variants, evidence)
        values (
          v_group_id,
          (v_question ->> 'ordinal')::smallint,
          (v_question ->> 'type')::question_type,
          v_question ->> 'prompt',
          v_question -> 'options',
          v_question -> 'correct_answer',
          coalesce(
            (select array_agg(value #>> '{}') from jsonb_array_elements(v_question -> 'accepted_variants')),
            '{}'::text[]
          ),
          v_question -> 'evidence'
        )
        on conflict (group_id, ordinal) do update
          set type              = excluded.type,
              prompt            = excluded.prompt,
              options           = excluded.options,
              correct_answer    = excluded.correct_answer,
              accepted_variants = excluded.accepted_variants,
              evidence          = excluded.evidence
        where questions.type              is distinct from excluded.type
           or questions.prompt            is distinct from excluded.prompt
           or questions.options           is distinct from excluded.options
           or questions.correct_answer    is distinct from excluded.correct_answer
           or questions.accepted_variants is distinct from excluded.accepted_variants
           or questions.evidence          is distinct from excluded.evidence
        returning (xmax = 0) into v_inserted;

        if found then
          if v_inserted then c_q_ins := c_q_ins + 1; else c_q_upd := c_q_upd + 1; end if;
        end if;
      end loop;

      select coalesce(array_agg((q ->> 'ordinal')::smallint), '{}'::smallint[])
        into v_keep
        from jsonb_array_elements(v_group -> 'questions') q;
      delete from questions where group_id = v_group_id and not (ordinal = any (v_keep));
      get diagnostics v_deleted = row_count;
      c_q_del := c_q_del + v_deleted;
    end loop;

    select coalesce(array_agg((g ->> 'ordinal')::smallint), '{}'::smallint[])
      into v_keep
      from jsonb_array_elements(v_section -> 'groups') g;
    delete from question_groups where section_id = v_section_id and not (ordinal = any (v_keep));
    get diagnostics v_deleted = row_count;
    c_grp_del := c_grp_del + v_deleted;
  end loop;

  select coalesce(array_agg((s ->> 'ordinal')::smallint), '{}'::smallint[])
    into v_keep
    from jsonb_array_elements(payload -> 'sections') s;
  delete from sections where test_id = v_test_id and not (ordinal = any (v_keep));
  get diagnostics v_deleted = row_count;
  c_sec_del := v_deleted;

  return jsonb_build_object(
    'tests',           jsonb_build_object('inserted', c_tests_ins, 'updated', c_tests_upd, 'deleted', 0),
    'sections',        jsonb_build_object('inserted', c_sec_ins, 'updated', c_sec_upd, 'deleted', c_sec_del),
    'question_groups', jsonb_build_object('inserted', c_grp_ins, 'updated', c_grp_upd, 'deleted', c_grp_del),
    'questions',       jsonb_build_object('inserted', c_q_ins, 'updated', c_q_upd, 'deleted', c_q_del)
  );
end;
$$;

revoke all on function seed_test(jsonb) from public, anon, authenticated;
grant execute on function seed_test(jsonb) to service_role;

comment on function seed_test(jsonb) is
  'Upserts one normalized test atomically. Idempotent: unchanged input rewrites no rows. Admin only.';
