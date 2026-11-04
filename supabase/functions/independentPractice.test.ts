import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import * as grammarScoring from './grammar-submit/scoring.ts';
import * as readingScoring from './reading-submit/scoring.ts';
import { computeSetAttemptUpdate } from './grammar-submit/setAttemptUpdate.ts';

function loadHandler(name: string, scope: string, prior = false) {
  const calls: string[] = [];
  const fixture: Record<string, unknown> = {
    lessons: { content_scope: scope },
    exercise_sets: { id: 'set', lesson_id: 'topic', category: name === 'reading-submit' ? 'doc' : 'nguphap', status: 'published' },
    grammar_exercises: [{ id: 'q', type: 'translation', correct_answer: 'Ja', acceptable_answers: [], explanation: 'Yes' }],
    reading_question_groups: [{ id: 'q', question_type: 'richtig_falsch', statements: [{ text: 'Ja', correct_answer: true }] }],
    exercise_set_attempts: null,
    practice_submission_history: prior ? { score: 100, total: 1, attempt_count: 1, best_score: 100, is_passed: true, revealed: true, results: {} } : null,
    lesson_progress: null,
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'user' } } }) },
    rpc: async (name: string) => {
      calls.push(name);
      if (name === 'save_practice_attempt') {
        if (!prior) calls.push('write:exercise_set_attempts');
        return { data: { score: 100,total: 1,correct_count: 1,attempt_count: 1,best_score: 100,is_passed: true,revealed: true,results: {} } };
      }
      return { data: name === 'practice_can_read_set' ? true : 1 };
    },
    from(table: string) {
      let many = true;
      const builder = {
        select() { return builder; }, eq() { return builder; },
        in() { many = true; return builder; },
        maybeSingle() { return Promise.resolve({ data: fixture[table] }); },
        single() { return Promise.resolve({ data: fixture[table] }); },
        async upsert() { calls.push(`write:${table}`); return { error: null }; },
        async insert() { calls.push(`write:${table}`); return { error: null }; },
        update() { calls.push(`write:${table}`); return builder; },
        then(resolve: (v: unknown) => unknown) { const value = fixture[table]; return Promise.resolve({ data: many && !Array.isArray(value) ? value ? [value] : [] : value }).then(resolve); },
      };
      return builder;
    },
  };
  let handler!: (req: Request) => Promise<Response>;
  const source = readFileSync(new URL(`./${name}/index.ts`, import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  new Function('serve', 'createClient', 'Deno', 'computeSetAttemptUpdate', 'computeGrammarScore', 'computeReadingScore', 'deriveCorrectAnswers', 'deriveExplanations', 'projectAnswers', compiled)(
    (fn: typeof handler) => { handler = fn; }, () => client, { env: { get: () => 'test' } }, computeSetAttemptUpdate,
    grammarScoring.computeGrammarScore, readingScoring.computeReadingScore,
    name === 'reading-submit' ? readingScoring.deriveCorrectAnswers : grammarScoring.deriveCorrectAnswers,
    readingScoring.deriveExplanations, name === 'reading-submit' ? readingScoring.projectAnswers : grammarScoring.projectAnswers,
  );
  return { calls, handler };
}
for (const name of ['grammar-submit', 'reading-submit']) {
  for (const prior of [false, true]) {
    test(`${name}: practice ${prior ? 'retry' : 'submission'} saves grades without course side effects`, async () => {
      const { calls, handler } = loadHandler(name, 'practice', prior);
      const res = await handler(new Request('https://test/submit', { method: 'POST', headers: { Authorization: 'Bearer user' }, body: JSON.stringify({ set_id: 'set', submission_id: 'request', answers: { q: 'Ja', 'q:0': 'true' } }) }));
      assert.equal(res.status, 200);
      assert.equal((await res.json()).xpEarned, 0);
      assert.ok(calls.includes('practice_can_read_set'));
      assert.equal(calls.includes('increment_xp'), false);
      assert.equal(calls.includes('record_learning_activity'), false);
      assert.equal(calls.includes('write:lesson_progress'), false);
      assert.equal(calls.includes('write:exercise_set_attempts'), !prior);
    });
  }
  test(`${name}: course submissions retain progress and streak`, async () => {
    const { calls, handler } = loadHandler(name, 'lesson');
    const res = await handler(new Request('https://test/submit', { method: 'POST', headers: { Authorization: 'Bearer user' }, body: JSON.stringify({ set_id: 'set', submission_id: 'request', answers: { q: 'Ja', 'q:0': 'true' } }) }));
    assert.equal(res.status, 200);
    assert.ok(calls.includes('write:lesson_progress'));
    assert.ok(calls.includes('record_learning_activity'));
  });
}
test('lesson-complete rejects practice before idempotency and rewards', async () => {
  const { calls, handler } = loadHandler('lesson-complete', 'practice');
  const res = await handler(new Request('https://test/lesson-complete/topic', { headers: { Authorization: 'Bearer user' } }));
  assert.equal(res.status, 400);
  assert.deepEqual(calls, []);
});
