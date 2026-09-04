import assert from "node:assert/strict";
import test from "node:test";
import { formatExerciseNumberLabel } from "./exerciseNumberLabel";

test("listening: restarts from 1 within each group", () => {
  assert.equal(
    formatExerciseNumberLabel({ isListening: true, groupIndex: 0, childIndex: 0 }),
    "1",
  );
  assert.equal(
    formatExerciseNumberLabel({ isListening: true, groupIndex: 0, childIndex: 2 }),
    "3",
  );
  assert.equal(
    formatExerciseNumberLabel({ isListening: true, groupIndex: 1, childIndex: 0 }),
    "1",
  );
});

test("non-listening: hierarchical group.child", () => {
  assert.equal(
    formatExerciseNumberLabel({ isListening: false, groupIndex: 0, childIndex: 0 }),
    "1.1",
  );
  assert.equal(
    formatExerciseNumberLabel({ isListening: false, groupIndex: 1, childIndex: 3 }),
    "2.4",
  );
});
