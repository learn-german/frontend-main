export const MAX_MEETING_CAPACITY = 10;

export type CapacityStatus = "open" | "almost" | "full";

export function capacityStatus(count: number): CapacityStatus {
  if (count >= MAX_MEETING_CAPACITY) return "full";
  if (count >= 8) return "almost";
  return "open";
}
