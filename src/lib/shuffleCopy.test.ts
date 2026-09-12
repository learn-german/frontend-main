import assert from "node:assert/strict";
import test from "node:test";
import { shuffleCopy } from "./shuffleCopy";

test("returns a permutation of the input", () => {
  const input = ["a", "b", "c", "d"];
  const output = shuffleCopy(input);
  assert.deepEqual([...output].sort(), [...input].sort());
  assert.equal(output.length, input.length);
});

test("does not mutate the original array", () => {
  const input = Object.freeze(["x", "y", "z"] as const);
  const before = [...input];
  shuffleCopy(input);
  assert.deepEqual([...input], before);
});

test("returns empty copy for empty input", () => {
  const input: string[] = [];
  assert.deepEqual(shuffleCopy(input), []);
  assert.notEqual(shuffleCopy(input), input);
});

test("returns single-element copy unchanged", () => {
  assert.deepEqual(shuffleCopy(["only"]), ["only"]);
});

test("can produce a different order when length >= 2", () => {
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    assert.notDeepEqual(shuffleCopy(["first", "second"]), ["first", "second"]);
  } finally {
    Math.random = originalRandom;
  }
});

test("deterministic with mocked Math.random (Fisher-Yates)", () => {
  const originalRandom = Math.random;
  const randomValues = [0, 0];
  Math.random = () => randomValues.shift() ?? 0;
  try {
    assert.deepEqual(shuffleCopy(["a", "b", "c"]), ["b", "c", "a"]);
  } finally {
    Math.random = originalRandom;
  }
});
