import assert from 'node:assert/strict';
import test from 'node:test';
import { validateSpeakingFile, speakingContentType, MAX_SPEAKING_FILE_SIZE } from './speaking';

test('accepts the five recording formats, including uppercase and empty browser MIME', () => {
  for (const name of ['voice.mp3', 'VOICE.M4A', 'voice.wav', 'voice.webm', 'voice.ogg']) {
    assert.equal(validateSpeakingFile({ name, size: MAX_SPEAKING_FILE_SIZE }), null);
    assert.ok(speakingContentType(name).startsWith('audio/'));
  }
});
test('rejects empty recordings, oversized audio and unsupported extensions', () => {
  for (const file of [{ name: 'a.mp3', size: 0 }, { name: 'a.wav', size: MAX_SPEAKING_FILE_SIZE + 1 }, { name: 'a.html', size: 20 }]) {
    assert.ok(validateSpeakingFile(file));
  }
});
