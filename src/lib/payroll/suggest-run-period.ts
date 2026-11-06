import type { PayFrequency, PayrollPayScheduleRow, PayrollRunRow } from "@/lib/payroll/types";

export type SuggestRunPeriodInput = {
  schedule: Pick<PayrollPayScheduleRow, "id" | "frequency" | "anchor_date" | "payment_offset_days">;
  payrollStartDate: string | null;
  priorRuns: Pick<PayrollRunRow, "pay_schedule_id" | "period_start" | "period_end" | "status">[];
};

export type SuggestedRunPeriod = {
  periodStart: string;
  periodEnd: string;
  paymentDate: string;
};

function parseDateOnly(iso: string): Date {
  // Date.UTC(year, ...) maps years 0-99 into 1900-1999; the ISO string
  // constructor also lets us reject rolled-over dates like 2026-02-30.
  const input = iso.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input) || input.startsWith("0000")) {
    throw new Error(`Invalid date: ${iso}`);
  }
  const date = new Date(`${input}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== input) {
    throw new Error(`Invalid date: ${iso}`);
  }
  return date;
}

function formatDateOnly(d: Date): string {
  const y = String(d.getUTCFullYear()).padStart(4, "0");
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

function addDaysUtc(iso: string, days: number): string {
  const d = parseDateOnly(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return formatDateOnly(d);
}

function lastDayOfMonthUtc(iso: string): string {
  const d = parseDateOnly(iso);
  d.setUTCMonth(d.getUTCMonth() + 1, 0);
  return formatDateOnly(d);
}

function periodEndForFrequency(frequency: PayFrequency, periodStart: string): string {
  switch (frequency) {
    case "weekly":
      return addDaysUtc(periodStart, 6);
    case "biweekly":
      return addDaysUtc(periodStart, 13);
    case "monthly":
      return lastDayOfMonthUtc(periodStart);
    case "semimonthly": {
      const day = parseDateOnly(periodStart).getUTCDate();
      if (day <= 15) {
        const d = parseDateOnly(periodStart);
        d.setUTCDate(15);
        return formatDateOnly(d);
      }
      return lastDayOfMonthUtc(periodStart);
    }
    default:
      return addDaysUtc(periodStart, 6);
  }
}

function nextPeriodStartAfterEnd(periodEnd: string, frequency: PayFrequency): string {
  if (frequency === "semimonthly") {
    const day = parseDateOnly(periodEnd).getUTCDate();
    const endIsMidMonth = day === 15;
    if (endIsMidMonth) {
      const d = parseDateOnly(periodEnd);
      d.setUTCDate(16);
      return formatDateOnly(d);
    }
    const d = parseDateOnly(periodEnd);
    d.setUTCMonth(d.getUTCMonth() + 1, 1);
    return formatDateOnly(d);
  }
  return addDaysUtc(periodEnd, 1);
}

/** Suggest the next pay period and payment date for a schedule (client-side helper). */
export function suggestNextRunPeriod(input: SuggestRunPeriodInput): SuggestedRunPeriod | null {
  const { schedule, payrollStartDate, priorRuns } = input;
  const scheduleRuns = priorRuns
    .filter((r) => r.pay_schedule_id === schedule.id)
    .filter((r) => r.status !== "void")
    .sort((a, b) => (a.period_end < b.period_end ? 1 : a.period_end > b.period_end ? -1 : 0));

  const last = scheduleRuns[0];
  let periodStart: string;
  if (last) {
    periodStart = nextPeriodStartAfterEnd(last.period_end, schedule.frequency);
  } else {
    periodStart = payrollStartDate?.trim() || schedule.anchor_date;
    try {
      parseDateOnly(periodStart);
    } catch {
      return null;
    }
  }

  const periodEnd = periodEndForFrequency(schedule.frequency, periodStart);
  const offset = Number.isFinite(schedule.payment_offset_days) ? schedule.payment_offset_days : 0;
  // Negative offsets are supported by pay schedule settings (down to -31).
  const paymentDate = addDaysUtc(periodEnd, Math.trunc(offset));

  return { periodStart, periodEnd, paymentDate };
}
