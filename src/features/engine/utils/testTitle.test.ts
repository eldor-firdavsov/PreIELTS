import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatTestTitle } from './testTitle.ts';

describe('formatTestTitle', () => {
  it('maps known external_ids to numbered IELTS test names', () => {
    assert.equal(formatTestTitle('legacy title', 'original-listening-1'), 'IELTS Listening Test 1');
    assert.equal(formatTestTitle('legacy title', 'listening'), 'IELTS Listening Test 2');
    assert.equal(formatTestTitle('legacy title', 'listening-1'), 'IELTS Listening Test 3');
    assert.equal(formatTestTitle('legacy title', 'listening-2'), 'IELTS Listening Test 4');

    assert.equal(formatTestTitle('legacy title', 'original-reading-1'), 'IELTS Reading Test 1');
    assert.equal(formatTestTitle('legacy title', 'reading'), 'IELTS Reading Test 2');
    assert.equal(formatTestTitle('legacy title', 'reading-2'), 'IELTS Reading Test 3');
  });

  it('normalises lowercase or irregular test titles to Title Case', () => {
    assert.equal(formatTestTitle('IELTS listening test 1'), 'IELTS Listening Test 1');
    assert.equal(formatTestTitle('IELTS reading test 2'), 'IELTS Reading Test 2');
    assert.equal(formatTestTitle('ielts listening test 5'), 'IELTS Listening Test 5');
  });

  it('normalises legacy generic titles', () => {
    assert.equal(formatTestTitle('IELTS CDI Listening Practice'), 'IELTS Listening Test');
    assert.equal(formatTestTitle('IELTS Full Reading Practice'), 'IELTS Reading Test');
    assert.equal(formatTestTitle('Listening 1 — Sports centre'), 'IELTS Listening Test 1');
    assert.equal(formatTestTitle('Academic Reading 1 — Beavers'), 'IELTS Reading Test 1');
  });

  it('falls back gracefully on empty or unknown titles', () => {
    assert.equal(formatTestTitle(null, null, 'listening'), 'IELTS Listening Test');
    assert.equal(formatTestTitle('', null, 'reading'), 'IELTS Reading Test');
    assert.equal(formatTestTitle(null, null, null), 'Untitled test');
  });
});
