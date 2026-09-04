import assert from "node:assert/strict";
import test from "node:test";
import { defaultSetTitleAt, nextDefaultSetTitle, planSetRenumber } from "./exerciseSetTitle";

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
