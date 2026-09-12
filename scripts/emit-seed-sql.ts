import fs from 'node:fs';
import { resolveContent } from './validate.ts';

const testMap = [
  { id: 'original-listening-1', title: 'IELTS Listening Test 1' },
  { id: 'listening', title: 'IELTS Listening Test 2' },
  { id: 'listening-2', title: 'IELTS Listening Test 4' },
  { id: 'listening-4', title: 'IELTS Listening Test 6' },
  { id: 'original-reading-1', title: 'IELTS Reading Test 1' },
  { id: 'reading-2', title: 'IELTS Reading Test 3' },
  { id: 'reading-4', title: 'IELTS Reading Test 5' },
  { id: 'full-cd-reading-m1', title: 'IELTS Reading Test 6' },
  { id: 'full-cd-ielts-reading-practice-test-3-3', title: 'IELTS Reading Test 8' }
];

let sql = '-- ====================================================================\n';
sql += '--  Setup IELTS Tests & Remove Writing/Speaking Tests\n';
sql += '--  Paste this into your Supabase SQL Editor and click RUN.\n';
sql += '-- ====================================================================\n\n';

sql += '-- 1. Remove writing and speaking tests and cascade data\n';
sql += 'delete from test_sessions where test_id in (\n';
sql += '  select distinct t.id\n';
sql += '    from tests t\n';
sql += '    join sections s on s.test_id = t.id\n';
sql += '   where s.kind in (\'writing\', \'speaking\')\n';
sql += ');\n\n';

sql += 'delete from tests where id in (\n';
sql += '  select distinct t.id\n';
sql += '    from tests t\n';
sql += '    join sections s on s.test_id = t.id\n';
sql += '   where s.kind in (\'writing\', \'speaking\')\n';
sql += ');\n\n';

sql += 'delete from user_progress where kind in (\'writing\', \'speaking\');\n';
sql += 'delete from ai_analyses where scope in (\'writing\', \'speaking\');\n\n';

sql += '-- 2. Seed and publish IELTS Listening and Reading tests\n';

for (const item of testMap) {
  const { path } = resolveContent(item.id);
  const test = JSON.parse(fs.readFileSync(path, 'utf8'));
  test.title = item.title;
  test.is_published = true;
  // Use $seed$ dollar-quoting
  sql += 'select seed_test($seed$' + JSON.stringify(test) + '$seed$::jsonb);\n\n';
}

sql += '-- 3. Standardise titles and ensure published flag\n';
for (const item of testMap) {
  sql += "update tests set title = '" + item.title + "', is_published = true where external_id = '" + item.id + "';\n";
}

fs.writeFileSync('setup-ielts-tests.sql', sql, 'utf8');
console.log('Successfully generated setup-ielts-tests.sql with proper dollar-quoting!');
