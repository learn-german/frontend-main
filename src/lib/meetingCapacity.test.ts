import assert from "node:assert/strict";
import test from "node:test";
import { MAX_MEETING_CAPACITY, capacityStatus, isValidMeetingCapacity } from "./meetingCapacity";

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

test("capacityStatus uses each session's capacity and the 80 percent threshold", () => {
  assert.equal(capacityStatus(3, 5), "open");
  assert.equal(capacityStatus(4, 5), "almost");
  assert.equal(capacityStatus(5, 5), "full");
  assert.equal(capacityStatus(10, 20), "open");
  assert.equal(capacityStatus(16, 20), "almost");
  assert.equal(capacityStatus(20, 20), "full");
  assert.equal(capacityStatus(1, 1), "full");
});


test("meeting capacity requires a positive PostgreSQL integer", () => {
  for (const value of [0, -1, 1.5, NaN, Infinity, 2147483648]) {
    assert.equal(isValidMeetingCapacity(value), false);
  }
  for (const value of [1, 10, 20, 2147483647]) assert.equal(isValidMeetingCapacity(value), true);
});
