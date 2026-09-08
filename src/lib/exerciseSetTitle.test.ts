import assert from "node:assert/strict";
import test from "node:test";
import {
  countSetsForCategory,
  defaultSetTitleAt,
  nextDefaultSetTitle,
  planSetRenumber,
} from "./exerciseSetTitle";

test("đặt tên mặc định theo đúng số thứ tự tiếp theo", () => {
  assert.equal(nextDefaultSetTitle(0), "Bài tập 1");
  assert.equal(nextDefaultSetTitle(4), "Bài tập 5");
});

test("defaultSetTitleAt is 1-based display title", () => {
  assert.equal(defaultSetTitleAt(0), "Bài tập 1");
  assert.equal(defaultSetTitleAt(2), "Bài tập 3");
});

test("nextDefaultSetTitle delegates to defaultSetTitleAt", () => {
  assert.equal(nextDefaultSetTitle(0), defaultSetTitleAt(0));
  assert.equal(nextDefaultSetTitle(4), "Bài tập 5");
});

test("countSetsForCategory counts only matching lesson + category", () => {
  const sets = [
    { lessonId: "l1", category: "nguphap" },
    { lessonId: "l1", category: "nguphap" },
    { lessonId: "l1", category: "nghe" },
    { lessonId: "l2", category: "nghe" },
  ];
  assert.equal(countSetsForCategory(sets, "l1", "nghe"), 1);
  assert.equal(countSetsForCategory(sets, "l1", "nguphap"), 2);
  assert.equal(countSetsForCategory(sets, "l1", "doc"), 0);
  assert.equal(countSetsForCategory(sets, "l2", "nghe"), 1);
});

test("nextDefaultSetTitle uses category count not cross-category total", () => {
  const sets = [
    { lessonId: "l1", category: "nguphap" },
    { lessonId: "l1", category: "nguphap" },
    { lessonId: "l1", category: "nghe" },
  ];
  const ngheCount = countSetsForCategory(sets, "l1", "nghe");
  assert.equal(nextDefaultSetTitle(ngheCount), "Bài tập 2");
});

test("planSetRenumber sorts by orderIndex and rewrites titles", () => {
  const plan = planSetRenumber([
    { id: "c", orderIndex: 5 },
    { id: "a", orderIndex: 1 },
    { id: "b", orderIndex: 3 },
  ]);
  assert.deepEqual(plan, [
    { id: "a", order_index: 0, title: "Bài tập 1" },
    { id: "b", order_index: 1, title: "Bài tập 2" },
    { id: "c", order_index: 2, title: "Bài tập 3" },
  ]);
});
