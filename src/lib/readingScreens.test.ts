import assert from "node:assert/strict";
import test from "node:test";
import { itemKey, buildReadingCarouselScreens } from "./readingScreens";
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

test("buildReadingCarouselScreens: 3 passages each 1 MC -> 3 multi_passage slides", () => {
  const groups = [
    multipleChoiceGroup("g1", "p1", 1),
    multipleChoiceGroup("g2", "p2", 1),
    multipleChoiceGroup("g3", "p3", 1),
  ];
  const passagesById = { p1: passage("p1", 0), p2: passage("p2", 1), p3: passage("p3", 2) };
  const result = buildReadingCarouselScreens(groups, passagesById, 3);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.layout, "multi_passage");
  assert.equal(result.screens.length, 3);
  assert.equal(result.screens[0].kind, "multi_passage");
  assert.deepEqual(result.screens.map((s) => s.kind), ["multi_passage", "multi_passage", "multi_passage"]);
});

test("buildReadingCarouselScreens: multi-passage with questionIntro still ok", () => {
  const g = multipleChoiceGroup("g1", "p1", 1);
  g.questionIntro = "Đọc đoạn văn sau.";
  const result = buildReadingCarouselScreens(
    [g, multipleChoiceGroup("g2", "p2", 1)],
    { p1: passage("p1", 0), p2: passage("p2", 1) },
    2,
  );
  assert.equal(result.ok, true);
});

test("buildReadingCarouselScreens: multi-passage with 2 MC sub-questions -> error", () => {
  const result = buildReadingCarouselScreens(
    [multipleChoiceGroup("g1", "p1", 2), multipleChoiceGroup("g2", "p2", 1)],
    { p1: passage("p1", 0), p2: passage("p2", 1) },
    2,
  );
  assert.equal(result.ok, false);
});

test("buildReadingCarouselScreens: single-passage 2 MC + 4 RF -> 3 slides", () => {
  const mc = multipleChoiceGroup("g-mc", "p1", 2);
  const rf = richtigFalschGroup("g-rf", "p1", 4);
  rf.orderIndex = 1;
  const result = buildReadingCarouselScreens([mc, rf], { p1: passage("p1", 0) }, 1);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.layout, "single_passage");
  assert.equal(result.screens.length, 3);
  assert.equal(result.screens[0].kind, "single_mc");
  assert.equal(result.screens[1].kind, "single_mc");
  assert.equal(result.screens[2].kind, "single_rf_summary");
  if (result.screens[2].kind === "single_rf_summary") {
    assert.equal(result.screens[2].items.length, 4);
    assert.equal(result.screens[2].items[0].key, "g-rf:0");
  }
});

test("buildReadingCarouselScreens: RF-only single-passage -> 1 summary slide", () => {
  const result = buildReadingCarouselScreens(
    [richtigFalschGroup("g1", "p1", 2)],
    { p1: passage("p1", 0) },
    1,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.screens.length, 1);
  assert.equal(result.screens[0].kind, "single_rf_summary");
});

test("buildReadingCarouselScreens: passageCount 0 -> error", () => {
  const result = buildReadingCarouselScreens(
    [multipleChoiceGroup("g1", "p1", 1)],
    { p1: passage("p1", 0) },
    0,
  );
  assert.equal(result.ok, false);
});
