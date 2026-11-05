import { describe, expect, it } from "vitest";
import type { DeferralSchedule } from "./deferrals.functions";
import {
  canPostDeferralEntry,
  deferralScheduleReconciliation,
  deferralPageCounts,
  deferralPageCsv,
  filterDeferralPage,
  previewDeferralSplit,
} from "./deferral-review";

const example: DeferralSchedule = {
  id: "s1",
  name: "Prepaid software",
  reference: "BILL-1",
  kind: "prepaid_expense",
  total_minor: 12000,
  status: "active",
  start_date: "2026-01-01",
  periods: 12,
  deferral_entries: [
    {
      id: "e1",
      period_no: 1,
      due_on: "2026-10-31",
      amount_minor: 1000,
      journal_id: null,
      posted_on: null,
      journals: null,
    },
    {
      id: "e2",
      period_no: 2,
      due_on: "2026-11-30",
      amount_minor: 1000,
      journal_id: "j2",
      posted_on: "2026-11-30",
      journals: { reversed_by_journal_id: "r2" },
    },
  ],
};

describe("deferral review", () => {
  it("reconciles exact scheduled, recognized, reversed and unposted minor amounts", () => {
    const result = deferralScheduleReconciliation(example);
    expect(result).toMatchObject({
      total: 12000n,
      scheduled: 2000n,
      recognized: 0n,
      reversed: 1000n,
      unposted: 1000n,
      difference: -10000n,
      entryCountMatches: false,
    });
    const complete: DeferralSchedule = {
      ...example,
      total_minor: 2000,
      periods: 2,
      deferral_entries: [
        example.deferral_entries[0]!,
        { ...example.deferral_entries[1]!, journals: { reversed_by_journal_id: null } },
      ],
    };
    expect(deferralScheduleReconciliation(complete)).toMatchObject({
      difference: 0n,
      recognized: 1000n,
      reversed: 0n,
      unposted: 1000n,
      entryCountMatches: true,
    });
  });

  it("rejects unsafe numeric amounts instead of fabricating a balanced result", () => {
    expect(deferralScheduleReconciliation({ ...example, total_minor: Number.MAX_SAFE_INTEGER + 1 })).toBeNull();
    expect(deferralScheduleReconciliation({ ...example, deferral_entries: [
      { ...example.deferral_entries[0]!, amount_minor: -1 },
    ] })).toBeNull();
  });

  it("guards future posting, pre-due catch-up and already-posted entries", () => {
    const due = example.deferral_entries[0]!;
    expect(canPostDeferralEntry(due, "active", "2026-11-04", "2026-11-04")).toBe(true);
    expect(canPostDeferralEntry(due, "active", "2026-11-04", "2026-10-30")).toBe(false);
    expect(canPostDeferralEntry(due, "active", "2026-11-04", "2026-11-05")).toBe(false);
    expect(canPostDeferralEntry(due, "active", "2026-11-04", "2026-11-31")).toBe(false);
    expect(canPostDeferralEntry(due, "cancelled", "2026-11-04", "2026-11-04")).toBe(false);
    expect(
      canPostDeferralEntry(example.deferral_entries[1]!, "active", "2026-12-01", "2026-12-01"),
    ).toBe(false);
  });

  it("filters only the fetched page and summarises due or reversed exceptions", () => {
    const cancelled: DeferralSchedule = { ...example, id: "s2", status: "cancelled" };
    const rows = [example, cancelled];
    expect(filterDeferralPage(rows, "due", "2026-11-04")).toHaveLength(1);
    expect(filterDeferralPage(rows, "cancelled", "2026-11-04")).toHaveLength(1);
    expect(deferralPageCounts(rows, "2026-11-04")).toEqual({
      schedules: 2,
      dueEntries: 1,
      reversedEntries: 2,
    });
  });

  it("previews exact integer splits, leaving the rounding remainder in the final month", () => {
    expect(previewDeferralSplit(1001n, 3)).toEqual({
      regularMinor: 333n,
      finalMinor: 335n,
    });
    expect(previewDeferralSplit(0n, 3)).toBeNull();
    expect(previewDeferralSplit(10n, 121)).toBeNull();
  });

  it("exports loaded entries with exact minor units and formula safe cells", () => {
    const csv = deferralPageCsv([{ ...example, name: "=XLOOKUP()" }]);
    expect(csv).toContain("'=XLOOKUP()");
    expect(csv).toContain("2026-10-31,1000");
    expect(csv).toContain("2026-11-30,1000,j2,2026-11-30,Yes");
  });
});
