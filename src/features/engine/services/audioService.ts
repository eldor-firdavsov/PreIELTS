import { supabase } from '../../../lib/supabase/client.ts';

/**
 * Signed playback URLs and fallback resolvers for listening audio.
 */

const SIGNED_URL_TTL_SECONDS = 2 * 60 * 60;

/** Known source URLs for tests when Supabase storage is not seeded. */
const AUDIO_FALLBACKS: Record<string, string> = {
  'audio/listening.mp3': 'https://ia600409.us.archive.org/26/items/vol-7-test-9-audio/vol%207%20test%209%20audio.mp3',
  'audio/listening-1.mp3': 'https://ia600704.us.archive.org/29/items/audio_20260830/Audio.mp3',
  'audio/listening-2.mp3': 'https://ia801009.us.archive.org/13/items/mix-24m-57s-audio-joiner.com-copy-copy-copy-copy-copy-copy-copy-copy-copy/mix_24m57s%20%28audio-joiner.com%29%20-%20CopyCopyCopyCopyCopyCopyCopyCopyCopy.mp3',
  'audio/listening-3.mp3': 'https://ia903203.us.archive.org/29/items/mix-27m-45s-audio-joiner.com-copy-copy-copy-copy-copy-copy-copy-copy/mix_27m45s%20%28audio-joiner.com%29%20-%20CopyCopyCopyCopyCopyCopyCopyCopy.mp3',
  'audio/listening-4.mp3': 'https://ia800901.us.archive.org/3/items/mix-28m-13s-audio-joiner.com-copy-copy-copy-copy-copy/mix_28m13s%20%28audio-joiner.com%29%20-%20CopyCopyCopyCopyCopy.mp3',
  'audio/listening-5.mp3': 'https://ia600400.us.archive.org/29/items/mix-27m-10s-audio-joiner.com/mix_27m10s%20%28audio-joiner.com%29.mp3',
  'audio/full-cd-ielts-listening-practice-master-2.mp3': 'https://ia902909.us.archive.org/3/items/m-2_20250830/M2.mp3',
  'audio/cdi-listening-test-master-listening-1.mp3': 'https://ia803208.us.archive.org/34/items/m-1_20250827/M1.mp3',
  'listening.mp3': 'https://ia600409.us.archive.org/26/items/vol-7-test-9-audio/vol%207%20test%209%20audio.mp3',
  'listening-1.mp3': 'https://ia600704.us.archive.org/29/items/audio_20260830/Audio.mp3',
  'listening-2.mp3': 'https://ia801009.us.archive.org/13/items/mix-24m-57s-audio-joiner.com-copy-copy-copy-copy-copy-copy-copy-copy-copy/mix_24m57s%20%28audio-joiner.com%29%20-%20CopyCopyCopyCopyCopyCopyCopyCopyCopy.mp3',
  'listening-3.mp3': 'https://ia903203.us.archive.org/29/items/mix-27m-45s-audio-joiner.com-copy-copy-copy-copy-copy-copy-copy-copy/mix_27m45s%20%28audio-joiner.com%29%20-%20CopyCopyCopyCopyCopyCopyCopyCopy.mp3',
  'listening-4.mp3': 'https://ia800901.us.archive.org/3/items/mix-28m-13s-audio-joiner.com-copy-copy-copy-copy-copy/mix_28m13s%20%28audio-joiner.com%29%20-%20CopyCopyCopyCopyCopy.mp3',
  'listening-5.mp3': 'https://ia600400.us.archive.org/29/items/mix-27m-10s-audio-joiner.com/mix_27m10s%20%28audio-joiner.com%29.mp3',
  'full-cd-ielts-listening-practice-master-2.mp3': 'https://ia902909.us.archive.org/3/items/m-2_20250830/M2.mp3',
  'cdi-listening-test-master-listening-1.mp3': 'https://ia803208.us.archive.org/34/items/m-1_20250827/M1.mp3',
};

const LOCAL_AUDIO_FILES = new Set([
  'cdi-listening-test-master-listening-1.mp3',
  'full-cd-ielts-listening-practice-master-2.mp3',
  'listening-1.mp3',
  'listening-2.mp3',
  'listening-3.mp3',
  'listening-4.mp3',
  'listening-5.mp3',
  'listening.mp3',
  'original-listening-1.mp3',
]);

function splitStoragePath(storagePath: string): { bucket: string; key: string } {
  const separator = storagePath.indexOf('/');
  if (separator <= 0 || separator === storagePath.length - 1) {
    return { bucket: 'audio', key: storagePath };
  }
  return {
    bucket: storagePath.slice(0, separator),
    key: storagePath.slice(separator + 1),
  };
}

export async function signAudioUrl(storagePath: string): Promise<string> {
  if (!storagePath) {
    throw new Error('No recording path provided.');
  }

  // 1. Direct HTTP/HTTPS URL
  if (/^https?:\/\//i.test(storagePath)) {
    return storagePath;
  }

  if (storagePath.startsWith('/audio/')) {
    return storagePath;
  }

  const { bucket, key } = splitStoragePath(storagePath);
  const cleanKey = key.split('/').pop() || key;

  // 2. Local public audio directory (instant, reliable, serves directly from Vite /audio/)
  if (LOCAL_AUDIO_FILES.has(cleanKey) || LOCAL_AUDIO_FILES.has(key) || cleanKey.endsWith('.mp3')) {
    return `/audio/${cleanKey}`;
  }

  // 3. Try Supabase Storage signed URL
  try {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(key, SIGNED_URL_TTL_SECONDS);
    if (!error && data?.signedUrl) {
      return data.signedUrl;
    }
  } catch {
    // Continue
  }

  // 4. Remote fallbacks if not local
  const fallback =
    AUDIO_FALLBACKS[storagePath] ||
    AUDIO_FALLBACKS[key] ||
    AUDIO_FALLBACKS[`audio/${key}`];
  if (fallback) {
    return fallback;
  }

  throw new Error('The recording could not be loaded.');
}

