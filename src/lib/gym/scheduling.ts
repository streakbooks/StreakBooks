export type TimeRange = { startsAt: string; endsAt: string };

function instant(value: string): number {
  const time = Date.parse(value);
  if (Number.isNaN(time)) throw new Error("Schedule time is invalid");
  return time;
}

export function rangesOverlap(left: TimeRange, right: TimeRange): boolean {
  const leftStart = instant(left.startsAt);
  const leftEnd = instant(left.endsAt);
  const rightStart = instant(right.startsAt);
  const rightEnd = instant(right.endsAt);
  if (leftStart >= leftEnd || rightStart >= rightEnd) throw new Error("Schedule end must be after the start");
  return leftStart < rightEnd && rightStart < leftEnd;
}

export function findConflict(candidate: TimeRange, existing: readonly TimeRange[]): TimeRange | null {
  return existing.find((range) => rangesOverlap(candidate, range)) ?? null;
}

export function classCapacity(input: { capacity: number; registered: number }): {
  remaining: number;
  waitlist: boolean;
} {
  if (!Number.isSafeInteger(input.capacity) || input.capacity <= 0) throw new Error("Capacity must be positive");
  if (!Number.isSafeInteger(input.registered) || input.registered < 0) {
    throw new Error("Registered count is invalid");
  }
  const remaining = Math.max(0, input.capacity - input.registered);
  return { remaining, waitlist: input.registered >= input.capacity };
}
