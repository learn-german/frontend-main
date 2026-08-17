import assert from "node:assert/strict";
import test from "node:test";
import { lessonsNeededToCatchUp, selectPlannedLessons } from "./dashboardProgress";
import type { LessonStatus } from "./completion";

test("lessonsNeededToCatchUp: gap 0 hoặc âm trả về 0", () => {
  assert.equal(lessonsNeededToCatchUp(0, 21), 0);
  assert.equal(lessonsNeededToCatchUp(-5, 21), 0);
});

test("lessonsNeededToCatchUp: null trả về 0", () => {
  assert.equal(lessonsNeededToCatchUp(null, 21), 0);
});

test("lessonsNeededToCatchUp: làm tròn lên đúng", () => {
  assert.equal(lessonsNeededToCatchUp(7, 21), 2); // 7% của 21 bài = 1.47 -> 2
  assert.equal(lessonsNeededToCatchUp(100 / 21, 21), 1); // đúng 1 bài
});

test("lessonsNeededToCatchUp: totalRequiredLessons = 0 trả về 0", () => {
  assert.equal(lessonsNeededToCatchUp(10, 0), 0);
});

const lesson = (id: string) => ({ id });

test("selectPlannedLessons: lấy bài current + 3 bài kế tiếp theo thứ tự", () => {
  const lessons = [lesson("a"), lesson("b"), lesson("c"), lesson("d"), lesson("e")];
  const statuses: Record<string, LessonStatus> = {
    a: "completed", b: "current", c: "locked", d: "locked", e: "locked",
  };
  const result = selectPlannedLessons(lessons, statuses, ["a"]);
  assert.deepEqual(result.map((l) => l.id), ["b", "c", "d", "e"]);
});

test("selectPlannedLessons: không đủ 4 bài sau current thì lấy hết phần còn lại", () => {
  const lessons = [lesson("a"), lesson("b")];
  const statuses: Record<string, LessonStatus> = { a: "completed", b: "current" };
  const result = selectPlannedLessons(lessons, statuses, ["a"]);
  assert.deepEqual(result.map((l) => l.id), ["b"]);
});

test("selectPlannedLessons: không có bài current (đã hoàn thành hết) -> mảng rỗng", () => {
  const lessons = [lesson("a"), lesson("b"), lesson("c")];
  const statuses: Record<string, LessonStatus> = { a: "completed", b: "completed", c: "completed" };
  const result = selectPlannedLessons(lessons, statuses, ["a", "b", "c"]);
  assert.deepEqual(result, []);
});
