import assert from "node:assert/strict";
import test from "node:test";
import { canRegisterMeeting, vnWeekBounds } from "./eligibility.ts";

test("computes VN Monday-Sunday week bounds", () => {
  assert.deepEqual(vnWeekBounds("2026-09-06"), {
    start: "2026-08-31",
    end: "2026-09-06",
  });
  assert.deepEqual(vnWeekBounds("2026-09-07"), {
    start: "2026-09-07",
    end: "2026-09-13",
  });
});

test("authorizes registration per session week", () => {
  const registeredWeekStarts = new Set(["2026-08-31"]);

  assert.equal(
    canRegisterMeeting("2026-09-05", 2, false, registeredWeekStarts),
    false,
  );
  assert.equal(
    canRegisterMeeting("2026-09-12", 2, false, registeredWeekStarts),
    true,
  );
  assert.equal(
    canRegisterMeeting("2026-09-12", 10, false, registeredWeekStarts),
    false,
  );
  assert.equal(
    canRegisterMeeting("2026-09-12", 2, true, registeredWeekStarts),
    false,
  );
});
