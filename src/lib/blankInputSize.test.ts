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

test("short values stay at min width", () => {
  assert.equal(blankInputCharWidth("a"), BLANK_INPUT_MIN_CHARS);
  assert.equal(blankInputCharWidth("hello"), BLANK_INPUT_MIN_CHARS);
  assert.equal(blankInputCharWidth("x".repeat(11)), BLANK_INPUT_MIN_CHARS);
});

test("grows past min at 12+ chars (+1 padding)", () => {
  assert.equal(blankInputCharWidth("abcdefghijkl"), 13); // 12+1
  assert.equal(blankInputCharWidth("x".repeat(20)), 21);
});

test("clamps at max", () => {
  assert.equal(blankInputCharWidth("x".repeat(39)), BLANK_INPUT_MAX_CHARS);
  assert.equal(blankInputCharWidth("x".repeat(40)), BLANK_INPUT_MAX_CHARS);
  assert.equal(blankInputCharWidth("x".repeat(100)), BLANK_INPUT_MAX_CHARS);
});
