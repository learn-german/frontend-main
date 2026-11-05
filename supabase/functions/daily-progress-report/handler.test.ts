import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import * as completion from './completion.ts';
import * as report from './report.ts';

function loadHandler({ role = 'admin', fail = '', pageCap = 1000, reading = true, grammar = true } = {}) {
  const writes: Record<string, unknown>[] = [];
  const pages: string[] = [];
  const fixtures: Record<string, unknown> = {
    profiles: { subscription_end_date: null, unlocked_levels: ['A1'], role: 'user' },
    modules: [{ level: 'A1', lessons: [{ id: 'lesson', order_index: 1, status: 'published' }] }],
    grammar_exercises_public: grammar ? [...Array.from({ length: 1000 }, () => ({ lesson_id: 'other', category: 'nguphap' })), { lesson_id: 'lesson', category: 'nghe' }] : [],
    reading_question_groups_public: reading ? [{ lesson_id: 'lesson' }] : [],
    lesson_progress: [],
    level_enrollments: { started_at: '2026-01-01', planned_completion_date: '2026-04-01' },
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'caller', app_metadata: { role } } }, error: null }) },
    from(table: string) {
      let offset = 0, end = Infinity, written: Record<string, unknown> | undefined;
      const result = () => ({ data: written ?? fixtures[table], error: fail === table ? { message: 'source unavailable' } : null });
      const builder = {
        select() { return builder; }, eq() { return builder; }, in() { return builder; },
        order(column: string) {
          if (table === 'lesson_progress') assert.ok(['lesson_id', 'category'].includes(column));
          return builder;
        },
        range(from: number, to: number) { offset = from; end = Math.min(to + 1, from + pageCap); pages.push(`${table}:${from}`); return builder; },
        single: async () => result(), maybeSingle: async () => result(),
        upsert(row: Record<string, unknown>) { writes.push(row); written = row; return builder; },
        then(resolve: (v: unknown) => unknown) { const response = result(); return Promise.resolve({ ...response, data: Array.isArray(response.data) ? response.data.slice(offset, end) : response.data }).then(resolve); },
      };
      return builder;
    },
  };
  let handler!: (req: Request) => Promise<Response>;
  const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const imports = { ...completion, ...report };
  new Function('serve', 'createClient', 'Deno', ...Object.keys(imports), compiled)(
    (fn: typeof handler) => { handler = fn; }, () => client, { env: { get: () => 'test' } }, ...Object.values(imports),
  );
  const request = () => handler(new Request('https://test/report', { method: 'POST', headers: { Authorization: 'Bearer user' }, body: JSON.stringify({ user_id: 'learner' }) }));
  return { request, writes, pages };
}

test('admin POST generates report for requested learner and requires reading pass', async () => {
  const { request, writes } = loadHandler({ grammar: false });
  const res = await request();
  assert.equal(res.status, 200);
  const result = await res.json();
  assert.equal(result.user_id, 'learner');
  assert.equal(result.completed_required_lessons, 0);
  assert.equal(writes.length, 1);
});
for (const role of ['user', 'tutor']) {
  test(`${role} cannot POST another learner report`, async () => {
    const { request, writes } = loadHandler({ role });
    assert.equal((await request()).status, 403);
    assert.equal(writes.length, 0);
  });
}
for (const pageCap of [1000, 200]) {
  test(`questions beyond API cap ${pageCap} remain required`, async () => {
    const { request, pages } = loadHandler({ pageCap, reading: false });
    const result = await (await request()).json();
    assert.equal(result.completed_required_lessons, 0);
    assert.ok(pages.includes('grammar_exercises_public:1000'));
  });
}
for (const fail of ['profiles', 'modules', 'grammar_exercises_public', 'reading_question_groups_public', 'lesson_progress', 'level_enrollments']) {
  test(`${fail} error cannot generate a false complete report`, async () => {
    const { request, writes } = loadHandler({ fail });
    assert.equal((await request()).status, 500);
    assert.equal(writes.length, 0);
  });
}
test('lesson with no authored questions retains existing completion rule', async () => {
  const { request } = loadHandler({ reading: false, grammar: false });
  assert.equal((await (await request()).json()).completed_required_lessons, 1);
});
