-- 0002_content_provenance
--
-- Gives `tests` a stable content key and a licensing record.
--
-- external_id is the seed's idempotency key. It comes from the raw filename
-- slug and never changes, so re-seeding an unchanged normalized file is a
-- no-op and swapping in licensed content is a data change rather than a code
-- change. Child rows stay keyed by the natural unique constraints already
-- declared in 0001: sections (test_id, ordinal), question_groups
-- (section_id, ordinal), questions (group_id, ordinal).
--
-- source_provenance records where the content came from and whether it may
-- ship. Everything ingested from content/raw/ is third-party practice material
-- and carries shippable: false.

alter table tests
  add column external_id text,
  add column source_provenance jsonb not null default '{}'::jsonb;

-- Backfill any pre-existing rows so the not-null constraint can be applied.
update tests set external_id = id::text where external_id is null;

alter table tests
  alter column external_id set not null,
  add constraint tests_external_id_key unique (external_id);

-- Content that is not clear to ship must never be published to students. The
-- rule is in CLAUDE.md; this makes the database refuse to hold the bad state.
alter table tests
  add constraint tests_unshippable_stays_unpublished
  check (
    is_published = false
    or coalesce((source_provenance ->> 'shippable')::boolean, false) = true
  );

comment on column tests.external_id is
  'Stable content key from the raw filename slug. Seed idempotency key.';
comment on column tests.source_provenance is
  'Origin, watermark, shippable flag and applied repair overlay for this test.';
