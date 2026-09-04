import assert from "node:assert/strict";
import test from "node:test";
import { MAX_MEETING_CAPACITY, capacityStatus } from "./meetingCapacity";

test("MAX_MEETING_CAPACITY is 10", () => {
  assert.equal(MAX_MEETING_CAPACITY, 10);
});

test("capacityStatus: below 8 → open", () => {
  assert.equal(capacityStatus(0), "open");
  assert.equal(capacityStatus(7), "open");
});

test("capacityStatus: 8–9 → almost", () => {
  assert.equal(capacityStatus(8), "almost");
  assert.equal(capacityStatus(9), "almost");
});

test("capacityStatus: 10+ → full", () => {
  assert.equal(capacityStatus(10), "full");
  assert.equal(capacityStatus(11), "full");
});
