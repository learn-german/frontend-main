import assert from "node:assert/strict";
import test from "node:test";
import { itemKey, buildReadingScreens } from "./readingScreens";
import type { ReadingQuestionGroupPublic, ReadingPassageLite } from "./hooks/useReadingQuestionGroups";

const passage = (id: string, orderIndex: number): ReadingPassageLite => ({ id, textDe: `text-${id}`, orderIndex });

const richtigFalschGroup = (
  id: string,
  passageId: string,
  statementCount: number,
): ReadingQuestionGroupPublic => ({
  id,
  passageId,
  title: `Teil ${id}`,
  questionIntro: null,
  questionType: "richtig_falsch",
  statements: Array.from({ length: statementCount }, (_, i) => ({ text: `statement-${id}-${i}` })),
  subQuestions: [],
  orderIndex: 0,
});

const multipleChoiceGroup = (
  id: string,
  passageId: string,
  subQuestionCount: number,
): ReadingQuestionGroupPublic => ({
  id,
  passageId,
  title: `Teil ${id}`,
  questionIntro: null,
  questionType: "multiple_choice",
  statements: [],
  subQuestions: Array.from({ length: subQuestionCount }, (_, i) => ({
    text_snippet: null,
    image_key: null,
    question: `q-${id}-${i}`,
    options: ["A", "B"],
  })),
  orderIndex: 0,
});

test("itemKey: ghép groupId và index bằng dấu hai chấm", () => {
  assert.equal(itemKey("g1", 0), "g1:0");
  assert.equal(itemKey("g1", 2), "g1:2");
});

test("buildReadingScreens: 1 nhóm richtig_falsch 2 câu -> 2 screen đúng thứ tự", () => {
  const groups = [richtigFalschGroup("g1", "p1", 2)];
  const passagesById = { p1: passage("p1", 0) };
  const screens = buildReadingScreens(groups, passagesById);
  assert.equal(screens.length, 2);
  assert.deepEqual(
    screens.map((s) => [s.questionIndex, s.questionCount, s.key]),
    [
      [0, 2, "g1:0"],
      [1, 2, "g1:1"],
    ],
  );
  assert.equal(screens[0].passageId, "p1");
  assert.equal(screens[0].group.id, "g1");
});

test("buildReadingScreens: multiple_choice đếm theo subQuestions", () => {
  const groups = [multipleChoiceGroup("g1", "p1", 3)];
  const passagesById = { p1: passage("p1", 0) };
  const screens = buildReadingScreens(groups, passagesById);
  assert.equal(screens.length, 3);
  assert.deepEqual(screens.map((s) => s.questionIndex), [0, 1, 2]);
});

test("buildReadingScreens: nhiều đoạn -> gộp phẳng theo thứ tự passage.orderIndex, giữ nguyên thứ tự nhóm trong cùng đoạn", () => {
  const groups = [
    richtigFalschGroup("g-p2", "p2", 1),
    richtigFalschGroup("g-p1-a", "p1", 1),
    richtigFalschGroup("g-p1-b", "p1", 1),
  ];
  const passagesById = { p1: passage("p1", 0), p2: passage("p2", 1) };
  const screens = buildReadingScreens(groups, passagesById);
  assert.deepEqual(
    screens.map((s) => s.group.id),
    ["g-p1-a", "g-p1-b", "g-p2"],
  );
});

test("buildReadingScreens: mảng groups rỗng -> mảng screens rỗng", () => {
  assert.deepEqual(buildReadingScreens([], {}), []);
});
