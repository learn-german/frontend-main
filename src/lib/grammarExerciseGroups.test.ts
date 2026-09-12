import assert from "node:assert/strict";
import {
  flattenGroupsWithOrder,
  getGroupSelectionState,
  groupGrammarExercises,
  moveGroup,
  orderedUniqueSetIds,
  resolveAppendGroupId,
  toggleGroupSelection,
  type GrammarExerciseGroup,
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

assert.deepEqual(moveGroup(["1", "2", "3", "4", "5"], "5", "2"), ["1", "5", "2", "3", "4"]);
assert.deepEqual(moveGroup(["1", "2"], "missing", "1"), ["1", "2"]);

let createIdCalls = 0;
assert.deepEqual(resolveAppendGroupId("existing", () => { createIdCalls += 1; return "new"; }), {
  groupId: "existing",
  assignedLegacyId: false,
});
assert.equal(createIdCalls, 0);
assert.deepEqual(resolveAppendGroupId(null, () => { createIdCalls += 1; return "new"; }), {
  groupId: "new",
  assignedLegacyId: true,
});
assert.equal(createIdCalls, 1);

type TestGroup = GrammarExerciseGroup<{ id: string; type: string; orderIndex: number; setId?: string }>;

const makeGroup = (
  key: string,
  exercises: Array<{ id: string; setId?: string; orderIndex?: number }>,
): TestGroup => ({
  key,
  type: "translation",
  exercises: exercises.map((exercise, index) => ({
    ...exercise,
    type: "translation",
    orderIndex: exercise.orderIndex ?? index,
  })),
});

assert.deepEqual(orderedUniqueSetIds([]), []);

assert.deepEqual(
  orderedUniqueSetIds([
    makeGroup("g1", [{ id: "a", setId: "set-1" }, { id: "b", setId: "set-1" }]),
  ]),
  ["set-1"],
);

assert.deepEqual(
  orderedUniqueSetIds([
    makeGroup("g1", [{ id: "a", setId: "set-1" }]),
    makeGroup("g2", [{ id: "b", setId: "set-2" }]),
    makeGroup("g3", [{ id: "c", setId: "set-3" }]),
  ]),
  ["set-1", "set-2", "set-3"],
);

assert.deepEqual(
  orderedUniqueSetIds([
    makeGroup("g1", [{ id: "a", setId: "set-1" }]),
    makeGroup("g2", [{ id: "b", setId: "set-1" }]),
    makeGroup("g3", [{ id: "c", setId: "set-2" }]),
  ]),
  ["set-1", "set-2"],
);

assert.deepEqual(
  orderedUniqueSetIds([
    makeGroup("empty", []),
    makeGroup("g1", [{ id: "a", setId: "set-1" }]),
    makeGroup("missing", [{ id: "b" }]),
  ]),
  ["set-1"],
);
