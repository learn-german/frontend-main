import assert from 'node:assert/strict';
import test from 'node:test';
import { computeStudyWorkload } from './workload.ts';
import type { LessonQuizFlags } from './completion.ts';

const lessons = (level: string, count: number): LessonQuizFlags[] =>
  Array.from({ length: count }, (_, i) => ({ id: `${level}-${i}`, hasDocQuestions: true }));
const a1 = lessons('A1', 23);
const complete = a1.slice(0, 4).map(({ id }) => ({ lesson_id: id, category: 'doc', quiz_score: 80 }));
const compute = (overrides: Partial<Parameters<typeof computeStudyWorkload>[0]> = {}) => computeStudyWorkload({
  unlockedLevels: ['A1'], lessonsByLevel: new Map([['A1', a1]]), progress: complete,
  subscriptionEndDate: '2026-11-22', reportDate: '2026-11-05', ...overrides,
});

test('4/23 lessons leaves 19 lessons over 17 subscription days, target 2/day', () => {
  assert.deepEqual(compute(), {
    levels: ['A1'], missing_levels: [], total_lessons: 23, completed_lessons: 4,
    remaining_lessons: 19, remaining_days: 17, lessons_per_day: 19 / 17,
    daily_lesson_target: 2, deadline_date: '2026-11-22',
  });
});

test('sums all unlocked levels, orders and deduplicates them, ignores locked levels', () => {
  const result = compute({ unlockedLevels: ['A2', 'A1', 'A2'], lessonsByLevel: new Map([
    ['A1', a1], ['A2', lessons('A2', 15)], ['B1', lessons('B1', 50)],
  ]) });
  assert.deepEqual(result.levels, ['A1', 'A2']);
  assert.equal(result.total_lessons, 38);
  assert.equal(result.completed_lessons, 4);
  assert.equal(result.remaining_lessons, 34);
  assert.equal(result.lessons_per_day, 2);
  assert.equal(result.daily_lesson_target, 2);
});

test('missing published lessons in any unlocked level makes target unknown', () => {
  for (const a2 of [undefined, []]) {
    const lessonsByLevel = new Map([['A1', a1]]);
    if (a2) lessonsByLevel.set('A2', a2);
    const result = compute({ unlockedLevels: ['A1', 'A2'], lessonsByLevel });
    assert.deepEqual(result.missing_levels, ['A2']);
    assert.equal(result.remaining_lessons, 19);
    assert.equal(result.lessons_per_day, null);
    assert.equal(result.daily_lesson_target, null);
  }
});

test('no deadline, deadline today or expired with remaining lessons gives no daily target', () => {
  for (const subscriptionEndDate of [null, '2026-11-05', '2026-10-01']) {
    const result = compute({ subscriptionEndDate });
    assert.equal(result.remaining_days, subscriptionEndDate === null ? null : 0);
    assert.equal(result.lessons_per_day, null);
    assert.equal(result.daily_lesson_target, null);
  }
});

test('all complete has zero target, unless another unlocked level is missing', () => {
  for (const subscriptionEndDate of [null, '2026-10-01', '2026-11-22']) {
    const result = compute({ lessonsByLevel: new Map([['A1', a1.slice(0, 4)]]), subscriptionEndDate });
    assert.equal(result.remaining_lessons, 0);
    assert.equal(result.lessons_per_day, 0);
    assert.equal(result.daily_lesson_target, 0);
  }
  const missing = compute({ unlockedLevels: ['A1', 'A2'], lessonsByLevel: new Map([['A1', a1.slice(0, 4)]]) });
  assert.equal(missing.remaining_lessons, 0);
  assert.equal(missing.daily_lesson_target, null);
});
