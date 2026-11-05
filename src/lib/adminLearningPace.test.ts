import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { summarizeLearningPace, type LearningPaceReport, type StudyWorkload } from './adminLearningPace';
const workload = (overrides:Partial<StudyWorkload> = {}):StudyWorkload => ({levels:['A1'],missing_levels:[],total_lessons:23,completed_lessons:4,remaining_lessons:19,remaining_days:17,lessons_per_day:19/17,daily_lesson_target:2,deadline_date:'2026-11-22',...overrides});
const report = (value:StudyWorkload):LearningPaceReport => ({generation_status:'success',study_workload:value});
test('Phat workload shows 19 remaining lessons over 17 days and a target of 2 per day', () => {
  const summary = summarizeLearningPace(report(workload()));
  assert.equal(summary?.state,'ready');
  assert.equal(summary?.lessons_per_day,19/17);
  assert.equal(summary?.daily_lesson_target,2);
});
test('all opened levels remain visible and missing A2 never appears completed', () => {
  const summary = summarizeLearningPace(report(workload({levels:['A1','A2'],missing_levels:['A2'],total_lessons:23,completed_lessons:23,remaining_lessons:0,lessons_per_day:null,daily_lesson_target:null})));
  assert.equal(summary?.state,'missing_levels');
  assert.deepEqual(summary?.levels,['A1','A2']);
});
test('expired and unknown subscriptions do not show a daily goal', () => {
  assert.equal(summarizeLearningPace(report(workload({remaining_days:0,lessons_per_day:null,daily_lesson_target:null})))?.state,'expired');
  assert.equal(summarizeLearningPace(report(workload({remaining_days:null,deadline_date:null,lessons_per_day:null,daily_lesson_target:null})))?.state,'no_deadline');
});
test('completion requires zero remaining lessons and no missing levels', () => {
  assert.equal(summarizeLearningPace(report(workload({completed_lessons:23,remaining_lessons:0,lessons_per_day:0,daily_lesson_target:0})))?.state,'complete');
});
test('failed, partial and inconsistent reports never show a goal', () => {
  assert.equal(summarizeLearningPace(null),null);
  assert.equal(summarizeLearningPace({generation_status:'error',study_workload:workload()}),null);
  assert.equal(summarizeLearningPace({generation_status:'empty'}),null);
  assert.equal(summarizeLearningPace(report(workload({remaining_lessons:3}))),null);
  assert.equal(summarizeLearningPace(report(workload({remaining_days:NaN}))),null);
});
