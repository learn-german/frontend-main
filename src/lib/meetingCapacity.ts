export const MAX_MEETING_CAPACITY = 10;

export type CapacityStatus = "open" | "almost" | "full";

export function capacityStatus(count: number, maxParticipants = MAX_MEETING_CAPACITY): CapacityStatus {
  if (count >= maxParticipants) return "full";
  if (count >= maxParticipants * 0.8) return "almost";
  return "open";
}

export function isValidMeetingCapacity(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= 2147483647;
}
