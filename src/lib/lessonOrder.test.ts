import assert from "node:assert/strict";
import { buildRoadmapItems } from "./lessonOrder";
import { computeLessonStatuses } from "./completion";
import type { Lesson, Module, LessonPosition, Level } from "./appTypes";

function makeLesson(id: string, orderIndex: number, level: Level = "A1"): Lesson {
  return {
    id,
    moduleId: "m1",
    moduleTitle: "Modul 1",
    level,
    title: id,
    titleVi: id,
    duration: "5:00",
    objective: "",
    summary: "",
    orderIndex,
    grammar: { title: "", rule: "", examples: [] },
    listeningClips: [],
    readingPassages: [],
  };
}

const moduleA1: Module = {
  id: "m1",
  level: "A1",
  title: "Modul 1",
  titleVi: "Modul 1",
  lessons: [makeLesson("l1", 1), makeLesson("l3", 3)],
};

const moduleA2: Module = {
  id: "m2",
  level: "A2",
  title: "Modul 2",
  titleVi: "Modul 2",
  lessons: [makeLesson("l9", 1, "A2")],
};

const draftBetween: LessonPosition = { id: "d2", moduleId: "m1", orderIndex: 2, status: "draft" };

// Draft nằm giữa: items giữ đủ 3, orderedLessons chỉ có 2 bài
const between = buildRoadmapItems([moduleA1], [draftBetween], ["A1"]);
assert.deepEqual(between.items.map((i) => (i.kind === "lesson" ? i.lesson.id : i.id)), ["l1", "d2", "l3"]);
assert.deepEqual(between.orderedLessons.map((l) => l.id), ["l1", "l3"]);

// BUG ĐÃ BÁO: draft không được chặn bài phía sau.
// Học xong l1 -> l3 phải là "current", không phải "locked".
const statusesBetween = computeLessonStatuses(between.orderedLessons, ["l1"]);
assert.equal(statusesBetween["l1"], "completed");
assert.equal(statusesBetween["l3"], "current");

// Draft nằm đầu: bài lesson đầu tiên vẫn là "current" khi chưa học gì
const draftFirst: LessonPosition = { id: "d0", moduleId: "m1", orderIndex: 0, status: "draft" };
const first = buildRoadmapItems([moduleA1], [draftFirst], ["A1"]);
assert.deepEqual(first.items.map((i) => (i.kind === "lesson" ? i.lesson.id : i.id)), ["d0", "l1", "l3"]);
assert.equal(computeLessonStatuses(first.orderedLessons, [])["l1"], "current");
assert.equal(computeLessonStatuses(first.orderedLessons, [])["l3"], "locked");

// Level chưa unlock bị loại hoàn toàn
const onlyA1 = buildRoadmapItems([moduleA1, moduleA2], [], ["A1"]);
assert.deepEqual(onlyA1.orderedLessons.map((l) => l.id), ["l1", "l3"]);
const bothLevels = buildRoadmapItems([moduleA1, moduleA2], [], ["A1", "A2"]);
assert.deepEqual(bothLevels.orderedLessons.map((l) => l.id), ["l1", "l3", "l9"]);

// Draft thuộc module chưa unlock bị loại
const draftInA2: LessonPosition = { id: "d9", moduleId: "m2", orderIndex: 2, status: "draft" };
assert.deepEqual(
  buildRoadmapItems([moduleA1, moduleA2], [draftInA2], ["A1"]).items.map((i) =>
    i.kind === "lesson" ? i.lesson.id : i.id,
  ),
  ["l1", "l3"],
);

// Position status "published" không được coi là draft
const publishedPosition: LessonPosition = { id: "l1", moduleId: "m1", orderIndex: 1, status: "published" };
assert.deepEqual(
  buildRoadmapItems([moduleA1], [publishedPosition], ["A1"]).items.map((i) =>
    i.kind === "lesson" ? i.lesson.id : i.id,
  ),
  ["l1", "l3"],
);

console.log("lessonOrder.test.ts OK");
