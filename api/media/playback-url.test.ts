import test from 'node:test';
import assert from 'node:assert/strict';
import handler from './playback-url.ts';

for (const allowed of [false, true]) {
  test(`practice image ${allowed ? 'published reference is signed' : 'unpublished reference is denied'}`, async () => {
    const originalFetch = globalThis.fetch;
    const originalEnv = { ...process.env };
    Object.assign(process.env, { SUPABASE_URL: 'https://db.test', SUPABASE_ANON_KEY: 'anon', R2_ACCOUNT_ID: 'test', R2_ACCESS_KEY_ID: 'test', R2_SECRET_ACCESS_KEY: 'test', R2_BUCKET_NAME: 'test' });
    const requests: string[] = [];
    globalThis.fetch = async (url) => {
      requests.push(String(url));
      return Response.json(requests.length === 1 ? { id: 'user' } : requests.length === 2 ? [{ id: 'topic', content_scope: 'practice' }] : allowed);
    };
    let status = 0;
    let body: any;
    const response = { status(code: number) { status = code; return response; }, json(value: unknown) { body = value; } };
    try {
      await handler({ method: 'GET', headers: { authorization: 'Bearer user' }, query: { lessonId: 'topic', type: 'image', objectKey: 'images/topic/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.png' } }, response);
      assert.equal(status, allowed ? 200 : 404);
      assert.ok(requests[2].endsWith('/rpc/practice_can_read_image'));
      assert.equal(typeof body.url === 'string', allowed);
    } finally {
      globalThis.fetch = originalFetch;
      process.env = originalEnv;
    }
  });
}
