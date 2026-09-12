-- ════════════════════════════════════════════════════════════════════
--  Supabase Auth Auto-Confirm & Unconfirmed Users Fix
--  Paste this into your Supabase SQL Editor and click RUN.
-- ════════════════════════════════════════════════════════════════════

-- 1. Confirm any existing unconfirmed users so they can log in immediately
update auth.users
   set email_confirmed_at = coalesce(email_confirmed_at, now())
 where email_confirmed_at is null;

-- 2. Create a trigger to automatically confirm any newly created users
create or replace function public.handle_auto_confirm_user()
returns trigger as $$
begin
  new.email_confirmed_at := coalesce(new.email_confirmed_at, now());
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists auto_confirm_user_trigger on auth.users;
create trigger auto_confirm_user_trigger
  before insert on auth.users
  for each row
  execute function public.handle_auto_confirm_user();
