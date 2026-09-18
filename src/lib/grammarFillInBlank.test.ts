import assert from "node:assert/strict";
import {
  applyChipToBlank,
  applyTypedBlankAnswer,
  countBlankMarkers,
  fillInBlankGroupClassName,
  fillInBlankLayout,
  findBlankTarget,
  getUsedWordIndexes,
  normalizeBlankDefinitions,
  normalizeWordBank,
  parseWordBankDragIndex,
  syncBlankDefinitions,
  WORD_BANK_DRAG_MIME,
  type BlankAssignments,
  type BlankFocus,
} from "./grammarFillInBlank";

assert.equal(countBlankMarkers("Das ist ___ Computer. ___ Computer ist teuer."), 2);
assert.equal(countBlankMarkers("Keine Lücke"), 0);

const answers = {
  first: ["", "voll"],
  second: ["", ""],
};

assert.deepEqual(findBlankTarget(["first", "second"], answers, null), {
  exerciseId: "first",
  blankIndex: 0,
});
assert.deepEqual(findBlankTarget(["first", "second"], answers, { exerciseId: "second", blankIndex: 1 }), {
  exerciseId: "second",
  blankIndex: 1,
});
assert.equal(findBlankTarget(["first"], { first: ["a", "b"] }, null), null);

const target: BlankFocus = { exerciseId: "first", blankIndex: 0 };
const emptyAssignments: BlankAssignments = {};
const firstChip = applyChipToBlank(answers, emptyAssignments, target, 0, "der", "single_use");
assert.equal(firstChip.answers.first[0], "der");
assert.deepEqual(getUsedWordIndexes(firstChip.assignments), new Set([0]));

const duplicateChip = applyChipToBlank(
  firstChip.answers,
  firstChip.assignments,
  { exerciseId: "second", blankIndex: 0 },
  1,
  "der",
  "single_use",
);
assert.deepEqual(getUsedWordIndexes(duplicateChip.assignments), new Set([0, 1]));

const blockedReuse = applyChipToBlank(
  duplicateChip.answers,
  duplicateChip.assignments,
  { exerciseId: "second", blankIndex: 1 },
  0,
  "der",
  "single_use",
);
assert.deepEqual(blockedReuse, duplicateChip);

const replacement = applyChipToBlank(
  duplicateChip.answers,
  duplicateChip.assignments,
  target,
  2,
  "die",
  "single_use",
);
assert.equal(replacement.answers.first[0], "die");
assert.deepEqual(getUsedWordIndexes(replacement.assignments), new Set([1, 2]));

const typed = applyTypedBlankAnswer(replacement.answers, replacement.assignments, target, "der");
assert.equal(typed.answers.first[0], "der");
assert.deepEqual(getUsedWordIndexes(typed.assignments), new Set([1]));

const multipleFirst = applyChipToBlank(answers, {}, target, 0, "der", "multiple_use");
const multipleSecond = applyChipToBlank(
  multipleFirst.answers,
  multipleFirst.assignments,
  { exerciseId: "second", blankIndex: 0 },
  0,
  "der",
  "multiple_use",
);
assert.equal(multipleSecond.answers.first[0], "der");
assert.equal(multipleSecond.answers.second[0], "der");

assert.deepEqual(
  syncBlankDefinitions("___ und ___", [{ acceptedAnswers: ["ist"] }]),
  [{ acceptedAnswers: ["ist"] }, { acceptedAnswers: [] }],
);
assert.deepEqual(
  syncBlankDefinitions("___", [{ acceptedAnswers: ["ist"] }, { acceptedAnswers: ["sind"] }]),
  [{ acceptedAnswers: ["ist"] }],
);
assert.deepEqual(normalizeBlankDefinitions([
  { acceptedAnswers: [" ist ", "", "sind"] },
]), [{ acceptedAnswers: ["ist", "sind"] }]);
assert.equal(normalizeBlankDefinitions([{ acceptedAnswers: [""] }]), null);
assert.deepEqual(normalizeWordBank(true, [" der ", "", "die"], "single_use"), {
  words: ["der", "die"],
  mode: "single_use",
});
assert.equal(normalizeWordBank(true, [" "], "multiple_use"), null);
assert.equal(normalizeWordBank(false, ["der"], "single_use"), null);

assert.equal(fillInBlankLayout(0), "passage");
assert.equal(fillInBlankLayout(1), "passage");
assert.equal(fillInBlankLayout(2), "rows");
assert.equal(fillInBlankLayout(8), "rows");
assert.equal(fillInBlankGroupClassName(1), "grid grid-cols-1 gap-3");
assert.equal(fillInBlankGroupClassName(2), "grid grid-cols-1 gap-3 md:grid-cols-2");

assert.equal(parseWordBankDragIndex({ getData: (m: string) => (m === WORD_BANK_DRAG_MIME ? "2" : "") } as unknown as DataTransfer), 2);
assert.equal(parseWordBankDragIndex({ getData: () => "" } as unknown as DataTransfer), null);
assert.equal(parseWordBankDragIndex({ getData: () => "x" } as unknown as DataTransfer), null);
