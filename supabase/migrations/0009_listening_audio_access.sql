-- 0009_listening_audio_access
--
-- Lets a student actually hear a listening test.
--
-- The `audio` bucket is private and deliberately stays that way: the recordings
-- are third-party practice material (CLAUDE.md, "Content provenance"), and a
-- public bucket would hand the whole corpus to anyone who guessed a filename.
-- Playback therefore goes through a short-lived signed URL, and creating one
-- requires select permission on the object — which is what this policy grants.
--
-- Readability is not a second rule invented here. It is the same rule that
-- governs the test the recording belongs to: published, or the caller is on the
-- content_testers allowlist. An object nobody can trace back to a readable
-- section is readable by nobody, so an orphaned upload stays sealed.
--
-- `sections.stimulus ->> 'audio_url'` is bucket-qualified ('audio/listening.mp3')
-- because that is what scripts/upload-audio.ts records, so it is compared
-- against bucket_id || '/' || name rather than against name alone.

create policy read_test_audio on storage.objects
  for select to authenticated
  using (
    bucket_id = 'audio'
    and exists (
      select 1
        from sections s
        join tests t on t.id = s.test_id
       where s.stimulus ->> 'audio_url' = bucket_id || '/' || name
         and (t.is_published or can_read_unpublished())
    )
  );

comment on policy read_test_audio on storage.objects is
  'Listening audio is readable exactly when the test it belongs to is readable. Playback uses a signed URL; the bucket stays private.';
