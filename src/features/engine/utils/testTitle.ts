export const CANONICAL_TEST_TITLES: Record<string, string> = {
  // Listening
  'original-listening-1': 'IELTS Listening Test 1',
  'listening': 'IELTS Listening Test 2',
  'listening-1': 'IELTS Listening Test 3',
  'listening-2': 'IELTS Listening Test 4',
  'listening-3': 'IELTS Listening Test 5',
  'listening-4': 'IELTS Listening Test 6',
  'listening-5': 'IELTS Listening Test 7',
  'cdi-listening-test-master-listening-1': 'IELTS Listening Test 8',
  'full-cd-ielts-listening-practice-master-2': 'IELTS Listening Test 9',
  'full-listening-cd-mock-v2-1-1-2': 'IELTS Listening Test 10',

  // Reading
  'original-reading-1': 'IELTS Reading Test 1',
  'reading': 'IELTS Reading Test 2',
  'reading-2': 'IELTS Reading Test 3',
  'reading-3': 'IELTS Reading Test 4',
  'reading-4': 'IELTS Reading Test 5',
  'full-cd-reading-m1': 'IELTS Reading Test 6',
  'full-cdi-reading-test-practice-3-2': 'IELTS Reading Test 7',
  'full-cd-ielts-reading-practice-test-3-3': 'IELTS Reading Test 8',
};

/**
 * Ensures consistent test naming across the app:
 * "IELTS Listening Test 1", "IELTS Reading Test 1", etc.
 */
export function formatTestTitle(
  title?: string | null,
  externalId?: string | null,
  fallbackKind?: string | null,
): string {
  if (externalId && CANONICAL_TEST_TITLES[externalId]) {
    return CANONICAL_TEST_TITLES[externalId];
  }

  const raw = (title ?? '').trim();

  // If already in standard format (e.g. "IELTS Listening Test 1" or "IELTS reading test 1"), normalise to Title Case
  const match = raw.match(/^IELTS\s+(listening|reading)\s+test\s+(\d+)$/i);
  if (match && match[1] && match[2]) {
    const kind = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
    return `IELTS ${kind} Test ${match[2]}`;
  }

  // Handle legacy titles
  if (raw === 'IELTS CDI Listening Practice' || raw.toLowerCase().includes('listening practice')) {
    return 'IELTS Listening Test';
  }
  if (raw === 'IELTS Full Reading Practice' || raw === 'IELTS CDI Reading Practice' || raw.toLowerCase().includes('reading practice')) {
    return 'IELTS Reading Test';
  }
  if (/^Listening\s+\d+/i.test(raw)) {
    const num = raw.match(/\d+/)?.[0] ?? '1';
    return `IELTS Listening Test ${num}`;
  }
  if (/^Academic\s+Reading\s+\d+/i.test(raw)) {
    const num = raw.match(/\d+/)?.[0] ?? '1';
    return `IELTS Reading Test ${num}`;
  }

  if (raw.length > 0) {
    return raw;
  }

  if (fallbackKind === 'listening') return 'IELTS Listening Test';
  if (fallbackKind === 'reading') return 'IELTS Reading Test';
  return 'Untitled test';
}
