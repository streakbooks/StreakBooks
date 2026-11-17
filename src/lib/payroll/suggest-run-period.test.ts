import { describe, expect, it } from "vitest";
import { suggestNextRunPeriod } from "@/lib/payroll/suggest-run-period";

const schedule = {
  id: "sched-1",
  frequency: "monthly" as const,
  anchor_date: "2026-01-01",
  payment_offset_days: 5,
};

describe("suggestNextRunPeriod", () => {
  it("uses payroll start date when no prior runs", () => {
    const result = suggestNextRunPeriod({
      schedule,
      payrollStartDate: "2026-03-10",
      priorRuns: [],
    });
    expect(result).toEqual({
      periodStart: "2026-03-10",
      periodEnd: "2026-03-31",
      paymentDate: "2026-04-05",
    });
  });

  it("continues after the latest run on the same schedule", () => {
    const result = suggestNextRunPeriod({
      schedule: { ...schedule, frequency: "weekly", payment_offset_days: 0 },
      payrollStartDate: "2026-01-01",
      priorRuns: [
        {
          pay_schedule_id: "sched-1",
          period_start: "2026-03-03",
          period_end: "2026-03-09",
          status: "posted",
        },
        {
          pay_schedule_id: "sched-1",
          period_start: "2026-02-24",
          period_end: "2026-03-02",
          status: "complete",
        },
      ],
    });
    expect(result).toEqual({
      periodStart: "2026-03-10",
      periodEnd: "2026-03-16",
      paymentDate: "2026-03-16",
    });
  });

  it("skips void runs and advances semimonthly periods", () => {
    const result = suggestNextRunPeriod({
      schedule: { ...schedule, frequency: "semimonthly", payment_offset_days: 2 },
      payrollStartDate: null,
      priorRuns: [
        {
          pay_schedule_id: "sched-1",
          period_start: "2026-04-01",
          period_end: "2026-04-15",
          status: "void",
        },
        {
          pay_schedule_id: "sched-1",
          period_start: "2026-04-01",
          period_end: "2026-04-15",
          status: "approved",
        },
      ],
    });
    expect(result).toEqual({
      periodStart: "2026-04-16",
      periodEnd: "2026-04-30",
      paymentDate: "2026-05-02",
    });
  });
  it("honours a negative payment offset, including a prior-month pay date", () => {
    const result = suggestNextRunPeriod({
      schedule: { ...schedule, frequency: "weekly", payment_offset_days: -10 },
      payrollStartDate: "2026-03-01",
      priorRuns: [],
    });
    expect(result).toEqual({
      periodStart: "2026-03-01",
      periodEnd: "2026-03-07",
      paymentDate: "2026-02-25",
    });
  });

  it("ignores void runs when proposing the next period", () => {
    const result = suggestNextRunPeriod({
      schedule,
      payrollStartDate: "2026-01-01",
      priorRuns: [
        {
          pay_schedule_id: "sched-1",
          period_start: "2026-05-01",
          period_end: "2026-05-31",
          status: "void",
        },
        {
          pay_schedule_id: "sched-1",
          period_start: "2026-03-01",
          period_end: "2026-03-31",
          status: "posted",
        },
      ],
    });
    expect(result?.periodStart).toBe("2026-04-01");
  });

  it("rejects impossible start dates instead of rolling them into the next month", () => {
    for (const invalid of ["2026-02-30", "2026-13-01", "0000-01-01"]) {
      expect(
        suggestNextRunPeriod({
          schedule,
          payrollStartDate: invalid,
          priorRuns: [],
        }),
      ).toBeNull();
    }
  });

  it("preserves early years without Date.UTC remapping", () => {
    expect(
      suggestNextRunPeriod({
        schedule: { ...schedule, frequency: "weekly", payment_offset_days: 0 },
        payrollStartDate: "0099-01-01",
        priorRuns: [],
      }),
    ).toMatchObject({
      periodStart: "0099-01-01",
      periodEnd: "0099-01-07",
    });
  });
});
