import { addDays, addMonths, daysBetween } from "@/lib/gym/dates";

export type RecognitionLine = {
  recogniseOn: string;
  amountMinor: number;
};

function positive(amount: number, label: string): number {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error(`${label} must be a positive minor-unit integer`);
  }
  return amount;
}

/** Split an amount across equal parts. The final part absorbs the remainder. */
export function splitMinor(amountMinor: number, parts: number): number[] {
  const amount = positive(amountMinor, "Amount");
  if (!Number.isSafeInteger(parts) || parts <= 0) throw new Error("Parts must be a positive integer");
  const base = Math.floor(amount / parts);
  let assigned = 0;
  return Array.from({ length: parts }, (_, index) => {
    const share = index === parts - 1 ? amount - assigned : base;
    assigned += share;
    return share;
  });
}

/**
 * Monthly recognition on each contract anniversary, starting on the service start date.
 * A $1,200 annual fee becomes twelve $100 lines when it divides evenly.
 */
export function monthlyRecognition(amountMinor: number, startsOn: string, months: number): RecognitionLine[] {
  return splitMinor(amountMinor, months).map((amount, index) => ({
    recogniseOn: addMonths(startsOn, index),
    amountMinor: amount,
  }));
}

/** Daily recognition across the inclusive service window. */
export function dailyRecognition(amountMinor: number, startsOn: string, endsOn: string): RecognitionLine[] {
  const days = daysBetween(startsOn, endsOn) + 1;
  if (days <= 0) throw new Error("Service end is before the start");
  return splitMinor(amountMinor, days).map((amount, index) => ({
    recogniseOn: addDays(startsOn, index),
    amountMinor: amount,
  }));
}

export function sessionRecognition(amountMinor: number, sessionCount: number): number[] {
  return splitMinor(amountMinor, sessionCount);
}

export function scheduleTotal(lines: readonly RecognitionLine[]): number {
  return lines.reduce((sum, line) => sum + line.amountMinor, 0);
}

/** Move unrecognised dates forward by a freeze. Already recognised lines stay put. */
export function shiftUnrecognised(
  lines: readonly (RecognitionLine & { recognised: boolean })[],
  freezeDays: number,
): RecognitionLine[] {
  if (!Number.isSafeInteger(freezeDays) || freezeDays < 0) {
    throw new Error("Freeze length must be a non-negative whole number of days");
  }
  return lines.map((line) => ({
    recogniseOn: line.recognised ? line.recogniseOn : addDays(line.recogniseOn, freezeDays),
    amountMinor: line.amountMinor,
  }));
}
