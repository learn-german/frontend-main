import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { saveSpeakingFeedback, validateSpeakingFeedbackFile } from './speakingFeedback';
import type { SpeakingSubmission } from './speaking';
const row = { id: 'attempt-1', feedback_object_key: 'feedback/attempt-1/old.mp3', feedback_file_name: 'old.mp3' } as SpeakingSubmission;
const file = new File(['audio'], 'new.M4A');
function fake(options: { upload?: boolean; update?: boolean; cleanup?: boolean; network?: boolean } = {}) {
  const calls: string[] = [];
  let patch: Record<string, unknown> = {};
  const bucket = {
    upload: async (key: string) => { calls.push(`upload:${key}`); return { error: options.upload ? new Error('upload') : null }; },
    remove: async ([key]: string[]) => { calls.push(`remove:${key}`); if (options.cleanup) throw new Error('cleanup'); return { error: null }; },
  };
  const client = { storage: { from: () => bucket }, from: () => ({ update: (value: Record<string, unknown>) => {
    patch = value; calls.push('update'); return { eq: () => ({ select: () => ({ single: async () => {
      if (options.network) throw new Error('network');
      return { data: options.update ? null : { id: row.id }, error: options.update ? new Error('update') : null };
    } }) }) };
  } }) } as unknown as SupabaseClient;
  return { client, calls, patch: () => patch };
}
test('text-only, audio-only, both, and score 0 save with one grade update', async () => {
  for (const [comment, audio] of [['Good', null], ['', file], ['Good', file]] as const) {
    const f = fake();
    assert.equal(await saveSpeakingFeedback(f.client, { ...row, feedback_object_key: null, feedback_file_name: null }, 0, comment, audio, false), null);
    assert.equal(f.patch().score, 0);
    assert.equal(f.patch().comment, comment || null);
    assert.equal(f.calls.filter(c => c === 'update').length, 1);
    if (audio) assert.match(String(f.patch().feedback_object_key), /^feedback\/attempt-1\/[a-f0-9-]+\.m4a$/);
    else assert.equal(f.patch().feedback_object_key, null);
  }
});
test('retains attached audio without changes; replacement/removal clean up only after update', async () => {
  const keep = fake(); await saveSpeakingFeedback(keep.client, row, 90, '', null, false);
  assert.equal(keep.patch().feedback_object_key, row.feedback_object_key); assert.deepEqual(keep.calls, ['update']);
  for (const audio of [file, null]) {
    const f = fake(); await saveSpeakingFeedback(f.client, row, 90, '', audio, !audio);
    assert.equal(f.calls.at(-1), `remove:${row.feedback_object_key}`);
    assert.ok(f.calls.indexOf('update') < f.calls.length - 1);
    if (!audio) { assert.equal(f.patch().feedback_object_key, null); assert.equal(f.patch().feedback_file_name, null); }
  }
});
test('upload failure never updates; update/network failure cleans new upload, never old audio', async () => {
  const upload = fake({ upload: true });
  await assert.rejects(saveSpeakingFeedback(upload.client, row, 90, '', file, false));
  assert.equal(upload.calls.length, 2);
  assert.ok(!upload.calls.includes('update'));
  for (const options of [{ update: true }, { network: true }, { update: true, cleanup: true }]) {
    const f = fake(options); await assert.rejects(saveSpeakingFeedback(f.client, row, 90, '', file, false));
    assert.ok(f.calls.at(-1)?.startsWith('remove:feedback/attempt-1/'));
    assert.ok(!f.calls.includes(`remove:${row.feedback_object_key}`));
  }
});
test('cleanup failure is a warning after successful save', async () => {
  const f = fake({ cleanup: true });
  assert.match((await saveSpeakingFeedback(f.client, row, 90, '', null, true))!, /Đã lưu điểm/);
});
test('invalid score, comment and files fail before upload/update', async () => {
  for (const bad of [new File([], 'a.mp3'), new File(['x'], 'a.txt'), new File(['x'], 'a'.repeat(256) + '.mp3')]) {
    assert.ok(validateSpeakingFeedbackFile(bad));
    const f = fake(); await assert.rejects(saveSpeakingFeedback(f.client, row, 90, '', bad, false)); assert.deepEqual(f.calls, []);
  }
  for (const score of [-1, 101, 1.5, NaN]) {
    const f = fake(); await assert.rejects(saveSpeakingFeedback(f.client, row, score, '', null, false)); assert.deepEqual(f.calls, []);
  }
  const f = fake(); await assert.rejects(saveSpeakingFeedback(f.client, row, 90, 'x'.repeat(10001), null, false));
});
