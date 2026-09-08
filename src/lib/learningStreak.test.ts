import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWeekActivity,
  computeNewStreak,
  daysBetween,
  mondayOfWeekContaining,
  vnCalendarDateIso,
} from "./learningStreak";

test("daysBetween: same day is 0", () => {
  assert.equal(daysBetween("2026-09-08", "2026-09-08"), 0);
});

test("daysBetween: consecutive days is 1", () => {
  assert.equal(daysBetween("2026-09-07", "2026-09-08"), 1);
});

test("computeNewStreak: first activity → 1", () => {
  assert.equal(computeNewStreak(null, "2026-09-08", 0), 1);
});

test("computeNewStreak: same day keeps streak", () => {
  assert.equal(computeNewStreak("2026-09-08", "2026-09-08", 5), 5);
});

test("computeNewStreak: yesterday → +1", () => {
  assert.equal(computeNewStreak("2026-09-07", "2026-09-08", 5), 6);
});

test("computeNewStreak: one missed day (last = 2 days ago) → +1", () => {
  assert.equal(computeNewStreak("2026-09-06", "2026-09-08", 5), 6);
});

test("computeNewStreak: two missed days (last = 3 days ago) → reset to 1", () => {
  assert.equal(computeNewStreak("2026-09-05", "2026-09-08", 5), 1);
});

test("mondayOfWeekContaining: Wednesday maps to Monday", () => {
  assert.equal(mondayOfWeekContaining("2026-09-09"), "2026-09-07");
});

test("mondayOfWeekContaining: Sunday maps to prior Monday", () => {
  assert.equal(mondayOfWeekContaining("2026-09-13"), "2026-09-07");
});

test("buildWeekActivity: marks Mon–Fri and Sun, leaves Sat empty", () => {
  const weekMonday = "2026-09-07";
  const bits = buildWeekActivity(
    ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-13"],
    weekMonday,
  );
  assert.deepEqual(bits, [true, true, true, true, true, false, true]);
});

test("vnCalendarDateIso: returns YYYY-MM-DD", () => {
  assert.match(vnCalendarDateIso(new Date("2026-09-08T10:00:00+07:00")), /^\d{4}-\d{2}-\d{2}$/);
});
