import assert from "node:assert/strict";
import test from "node:test";
import { nextDefaultSetTitle } from "./exerciseSetTitle";

test("đặt tên mặc định theo đúng số thứ tự tiếp theo", () => {
  assert.equal(nextDefaultSetTitle(0), "Bài tập 1");
  assert.equal(nextDefaultSetTitle(4), "Bài tập 5");
});
