import type { LearnerMeetingSession, LearnerMeetingsResponse } from "./appTypes";

export function selectWeeklyMeeting(
  response: LearnerMeetingsResponse,
): LearnerMeetingSession | null {
  return (
    response.sessions.find(
      (session) =>
        session.id === response.myRegistrationSessionId && session.isRegistered,
    ) ??
    response.sessions.find((session) => session.isRegistered) ??
    null
  );
}
