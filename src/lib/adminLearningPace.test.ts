import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { summarizeLearningPace, type LearningPaceReport } from './adminLearningPace';
const report = (actual:number,expected:number):LearningPaceReport => ({generation_status:'success',actual_progress_percentage:actual,expected_progress_percentage:expected});
test('pace compares actual with expected using the existing 5/10 point thresholds', () => {
  assert.equal(summarizeLearningPace(report(55,50))?.status,'ahead');
  assert.equal(summarizeLearningPace(report(50,50))?.status,'on_track');
  assert.equal(summarizeLearningPace(report(46,50))?.status,'on_track');
  assert.equal(summarizeLearningPace(report(45,50))?.status,'attention');
  assert.equal(summarizeLearningPace(report(40,50))?.status,'behind');
  assert.equal(summarizeLearningPace(report(100,100))?.status,'on_track');
});
test('missing, errored and invalid reports never appear on track', () => {
  for (const value of [null,{generation_status:'empty'},{generation_status:'error'}, {...report(50,50),generation_status:'insufficient_data'}, {...report(50,50),expected_progress_percentage:null},report(NaN,50),report(101,50),report(10,-1)]) {
    assert.equal(summarizeLearningPace(value as LearningPaceReport|null),null);
  }
});
test('pace gap is expressed in percentage points, keeping its direction', () => {
  assert.equal(summarizeLearningPace(report(30,50))?.difference,-20);
  assert.equal(summarizeLearningPace(report(55,50))?.difference,5);
});
