-- ════════════════════════════════════════════════════════════════════
--  Update test names to standard IELTS test numbering:
--  "IELTS Listening Test 1", "IELTS Listening Test 2"...
--  "IELTS Reading Test 1", "IELTS Reading Test 2"...
--  Paste this into the Supabase SQL Editor and run it.
-- ════════════════════════════════════════════════════════════════════

-- Listening tests
update tests set title = 'IELTS Listening Test 1' where external_id = 'original-listening-1';
update tests set title = 'IELTS Listening Test 2' where external_id = 'listening';
update tests set title = 'IELTS Listening Test 3' where external_id = 'listening-1';
update tests set title = 'IELTS Listening Test 4' where external_id = 'listening-2';
update tests set title = 'IELTS Listening Test 5' where external_id = 'listening-3';
update tests set title = 'IELTS Listening Test 6' where external_id = 'listening-4';
update tests set title = 'IELTS Listening Test 7' where external_id = 'listening-5';
update tests set title = 'IELTS Listening Test 8' where external_id = 'cdi-listening-test-master-listening-1';
update tests set title = 'IELTS Listening Test 9' where external_id = 'full-cd-ielts-listening-practice-master-2';
update tests set title = 'IELTS Listening Test 10' where external_id = 'full-listening-cd-mock-v2-1-1-2';

-- Reading tests
update tests set title = 'IELTS Reading Test 1' where external_id = 'original-reading-1';
update tests set title = 'IELTS Reading Test 2' where external_id = 'reading';
update tests set title = 'IELTS Reading Test 3' where external_id = 'reading-2';
update tests set title = 'IELTS Reading Test 4' where external_id = 'reading-3';
update tests set title = 'IELTS Reading Test 5' where external_id = 'reading-4';
update tests set title = 'IELTS Reading Test 6' where external_id = 'full-cd-reading-m1';
update tests set title = 'IELTS Reading Test 7' where external_id = 'full-cdi-reading-test-practice-3-2';
update tests set title = 'IELTS Reading Test 8' where external_id = 'full-cd-ielts-reading-practice-test-3-3';

-- Catch-all for any other tests with legacy naming
update tests
   set title = 'IELTS Listening Test ' || sub.row_number
  from (
    select id, row_number() over (order by created_at) as row_number
      from tests
     where title ilike '%listening%'
       and title not like 'IELTS Listening Test %'
  ) sub
 where tests.id = sub.id
   and tests.external_id not in (
     'original-listening-1', 'listening', 'listening-1', 'listening-2',
     'listening-3', 'listening-4', 'listening-5',
     'cdi-listening-test-master-listening-1',
     'full-cd-ielts-listening-practice-master-2',
     'full-listening-cd-mock-v2-1-1-2'
   );

update tests
   set title = 'IELTS Reading Test ' || sub.row_number
  from (
    select id, row_number() over (order by created_at) as row_number
      from tests
     where title ilike '%reading%'
       and title not like 'IELTS Reading Test %'
  ) sub
 where tests.id = sub.id
   and tests.external_id not in (
     'original-reading-1', 'reading', 'reading-2', 'reading-3', 'reading-4',
     'full-cd-reading-m1', 'full-cdi-reading-test-practice-3-2',
     'full-cd-ielts-reading-practice-test-3-3'
   );

-- Verification: show the updated tests
select id, external_id, title, is_published from tests order by title;
