export function vnWeekBounds(date: string): { start: string; end: string } {
  const current = new Date(`${date}T00:00:00Z`);
  const mondayOffset = (current.getUTCDay() + 6) % 7;
  const start = new Date(current);
  start.setUTCDate(current.getUTCDate() - mondayOffset);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export function canRegisterMeeting(
  sessionDate: string,
  registrationCount: number,
  isRegistered: boolean,
  registeredWeekStarts: ReadonlySet<string>,
): boolean {
  return registrationCount < 10 &&
    !isRegistered &&
    !registeredWeekStarts.has(vnWeekBounds(sessionDate).start);
}
