-- 0011_profile_onboarding
--
-- What onboarding asks for, and what makes a profile finished.
--
-- A student arrives knowing their level in one of two scales, or not at all:
-- some have sat IELTS and have a band, some know their CEFR level from a
-- course, and some genuinely do not know. Recording which scale the number came
-- from matters, because a self-reported 6.0 and a self-reported B2 are not the
-- same claim and must not be silently averaged into one.
--
-- `onboarded_at` is what the guard reads. It is deliberately not the same thing
-- as "a row exists": a half-finished insert must not count as onboarded, and a
-- later change to the questions can reopen onboarding by clearing this column
-- without deleting anything a student told us.

create type level_scale as enum ('ielts', 'cefr', 'unsure');
create type cefr_level as enum ('A1', 'A2', 'B1', 'B2', 'C1', 'C2');

alter table profiles
  add column level_scale  level_scale,
  add column current_band numeric(2,1),
  add column cefr_level   cefr_level,
  add column onboarded_at timestamptz;

-- A band is a real IELTS band: 0 to 9 in half steps.
alter table profiles add constraint profiles_current_band_valid check (
  current_band is null
  or (current_band >= 0 and current_band <= 9 and (current_band * 2) = floor(current_band * 2))
);

alter table profiles add constraint profiles_target_band_valid check (
  target_band is null
  or (target_band >= 0 and target_band <= 9 and (target_band * 2) = floor(target_band * 2))
);

-- The declared scale and the populated column have to agree. Without this a row
-- could claim 'cefr' and carry a band, and every reader would have to decide
-- for itself which one to believe.
alter table profiles add constraint profiles_level_matches_scale check (
  level_scale is null
  or (level_scale = 'ielts'  and current_band is not null and cefr_level is null)
  or (level_scale = 'cefr'   and cefr_level   is not null and current_band is null)
  or (level_scale = 'unsure' and current_band is null     and cefr_level is null)
);

-- Onboarding is finished only when the answers it asks for are actually there.
alter table profiles add constraint profiles_onboarded_is_complete check (
  onboarded_at is null
  or (full_name is not null and btrim(full_name) <> '' and level_scale is not null)
);

comment on column profiles.level_scale is
  'Which scale the student reported their starting level in. Never inferred from the other columns.';
comment on column profiles.onboarded_at is
  'Set when onboarding is completed. The route guard reads this, not the row''s existence.';
