import assert from "node:assert/strict";
import test from "node:test";
import {
  blankInputCharWidth,
  BLANK_INPUT_MIN_CHARS,
  BLANK_INPUT_MAX_CHARS,
} from "./blankInputSize";

test("empty value uses min width", () => {
  assert.equal(blankInputCharWidth(""), BLANK_INPUT_MIN_CHARS);
});

test("grows with content (+1 padding)", () => {
  assert.equal(blankInputCharWidth("hello"), 12); // max(5+1, 12) = 12
  assert.equal(blankInputCharWidth("abcdefghijkl"), 13); // 12+1
});

test("clamps at max", () => {
  const long = "x".repeat(100);
  assert.equal(blankInputCharWidth(long), BLANK_INPUT_MAX_CHARS);
});
