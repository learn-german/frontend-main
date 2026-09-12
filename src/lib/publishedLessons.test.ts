import assert from "node:assert/strict";
import test from "node:test";
import { filterPublishedLessons, isPublishedLessonStatus } from "./publishedLessons";

test("isPublishedLessonStatus only accepts published", () => {
  assert.equal(isPublishedLessonStatus("published"), true);
  assert.equal(isPublishedLessonStatus("draft"), false);
  assert.equal(isPublishedLessonStatus(undefined), false);
  assert.equal(isPublishedLessonStatus(null), false);
  assert.equal(isPublishedLessonStatus(""), false);
});

test("filterPublishedLessons drops drafts so admin JWT cannot leak Testing cards onto roadmap", () => {
  const rows = [
    { id: "a1-l1", status: "published" },
    { id: "a2-l2", status: "draft", title: "Testing" },
    { id: "b2-l1", status: "draft", title: "Testing" },
    { id: "b1-l1", status: "published" },
  ];
  assert.deepEqual(
    filterPublishedLessons(rows).map((r) => r.id),
    ["a1-l1", "b1-l1"],
  );
});
