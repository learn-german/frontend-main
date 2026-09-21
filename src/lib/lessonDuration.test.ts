import assert from "node:assert/strict";
import test from "node:test";
import {
  formatDurationClock,
  formatDurationLabel,
  parseDurationSeconds,
} from "./lessonDuration";

test("parseDurationSeconds reads MM:SS, minutes text, and plain minutes", () => {
  assert.equal(parseDurationSeconds("05:40"), 340);
  assert.equal(parseDurationSeconds("5:40"), 340);
  assert.equal(parseDurationSeconds("10 phút"), 600);
  assert.equal(parseDurationSeconds("10"), 600);
  assert.equal(parseDurationSeconds(""), 0);
});

test("formatDurationLabel matches dashboard mockup", () => {
  assert.equal(formatDurationLabel("05:40"), "05:40 phút");
  assert.equal(formatDurationLabel("10 phút"), "10:00 phút");
  assert.equal(formatDurationClock(340), "05:40");
  assert.equal(formatDurationClock(862), "14:22");
});
