import assert from "node:assert/strict";
import test from "node:test";
import { hasAnyAnswer, pickHydrateSource } from "./exerciseSetDraftLogic";

test("hasAnyAnswer: mọi giá trị rỗng -> false", () => {
  assert.equal(hasAnyAnswer({ a: "", b: "  " }), false);
});

test("hasAnyAnswer: có ít nhất 1 giá trị không rỗng -> true", () => {
  assert.equal(hasAnyAnswer({ a: "", b: "ich" }), true);
});

test("hasAnyAnswer: object rỗng -> false", () => {
  assert.equal(hasAnyAnswer({}), false);
});

test("pickHydrateSource: có draft -> draft thắng dù có cả attempt", () => {
  assert.equal(pickHydrateSource(true, true), "draft");
});

test("pickHydrateSource: không draft, có attempt -> attempt", () => {
  assert.equal(pickHydrateSource(false, true), "attempt");
});

test("pickHydrateSource: không có gì -> blank", () => {
  assert.equal(pickHydrateSource(false, false), "blank");
});
