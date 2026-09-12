import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { signAudioUrl } from './audioService.ts';

describe('signAudioUrl resolver', () => {
  it('returns direct HTTP URLs as-is', async () => {
    const url = await signAudioUrl('https://example.com/audio.mp3');
    assert.equal(url, 'https://example.com/audio.mp3');
  });

  it('returns direct /audio/ paths as-is', async () => {
    const url = await signAudioUrl('/audio/listening-1.mp3');
    assert.equal(url, '/audio/listening-1.mp3');
  });

  it('resolves audio/listening-1.mp3 to local /audio/listening-1.mp3', async () => {
    const url = await signAudioUrl('audio/listening-1.mp3');
    assert.equal(url, '/audio/listening-1.mp3');
  });

  it('resolves bare listening-2.mp3 to /audio/listening-2.mp3', async () => {
    const url = await signAudioUrl('listening-2.mp3');
    assert.equal(url, '/audio/listening-2.mp3');
  });

  it('resolves full-cd-ielts-listening-practice-master-2.mp3 to local file', async () => {
    const url = await signAudioUrl('audio/full-cd-ielts-listening-practice-master-2.mp3');
    assert.equal(url, '/audio/full-cd-ielts-listening-practice-master-2.mp3');
  });

  it('throws for empty storage path', async () => {
    await assert.rejects(async () => {
      await signAudioUrl('');
    }, /No recording path provided/);
  });
});
