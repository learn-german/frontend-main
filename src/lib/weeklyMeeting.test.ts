import assert from "node:assert/strict";
import test from "node:test";
import type { LearnerMeetingSession, LearnerMeetingsResponse } from "./appTypes";
import { selectWeeklyMeeting } from "./weeklyMeeting";

function session(id: string, isRegistered: boolean): LearnerMeetingSession {
  return {
    id,
    title: id,
    level: "A1",
    sessionDate: "2026-09-07",
    startTime: "10:00",
    endTime: "11:00",
    note: null,
    registrationCount: 1,
    isRegistered,
    canRegister: !isRegistered,
    meetUrl: isRegistered ? "https://meet.google.com/test" : null,
  };
}

test("prefers myRegistrationSessionId over another registered session", () => {
  const response: LearnerMeetingsResponse = {
    sessions: [session("first", true), session("preferred", true)],
    myRegistrationSessionId: "preferred",
  };

  assert.equal(selectWeeklyMeeting(response)?.id, "preferred");
});

test("falls back to the first registered upcoming session", () => {
  const response: LearnerMeetingsResponse = {
    sessions: [session("open", false), session("registered", true)],
    myRegistrationSessionId: null,
  };

  assert.equal(selectWeeklyMeeting(response)?.id, "registered");
});

test("returns null when no session is registered", () => {
  const response: LearnerMeetingsResponse = {
    sessions: [session("open", false)],
    myRegistrationSessionId: null,
  };

  assert.equal(selectWeeklyMeeting(response), null);
});
