import assert from "node:assert/strict";
import {
  flattenGroupsWithOrder,
  getGroupSelectionState,
  groupGrammarExercises,
  toggleGroupSelection,
} from "./grammarExerciseGroups";

const items = [
  { id: "b", type: "translation", groupId: "g1", orderIndex: 4 },
  { id: "a", type: "translation", groupId: "g1", orderIndex: 2 },
  { id: "legacy-1", type: "translation", orderIndex: 8 },
  { id: "legacy-2", type: "translation", orderIndex: 9 },
  { id: "mixed", type: "word_reorder", groupId: "g1", orderIndex: 10 },
] as const;

const groups = groupGrammarExercises(items);

assert.deepEqual(
  groups.map((group) => group.exercises.map((exercise) => exercise.id)),
  [["a", "b"], ["legacy-1"], ["legacy-2"], ["mixed"]],
);

assert.deepEqual(
  flattenGroupsWithOrder([groups[2], groups[0], groups[1], groups[3]]).map(({ exercise, orderIndex }) => [
    exercise.id,
    orderIndex,
  ]),
  [["legacy-2", 0], ["a", 1], ["b", 2], ["legacy-1", 3], ["mixed", 4]],
);

assert.equal(getGroupSelectionState(["a", "b"], new Set()), "none");
assert.equal(getGroupSelectionState(["a", "b"], new Set(["a"])), "some");
assert.equal(getGroupSelectionState(["a", "b"], new Set(["a", "b"])), "all");

assert.deepEqual([...toggleGroupSelection(["a", "b"], new Set(["a"]))].sort(), ["a", "b"]);
assert.deepEqual([...toggleGroupSelection(["a", "b"], new Set(["a", "b", "x"]))].sort(), ["x"]);
