import { describe, expect, it } from "vitest";
import { commissionMinor } from "@/lib/gym/commissions";
import { addMonths } from "@/lib/gym/dates";
import { planMemberImport } from "@/lib/gym/import-members";
import { churnInsight, deferredExceptionInsight } from "@/lib/gym/insights";
import { churnRate, recurringRevenue, retentionRate } from "@/lib/gym/kpis";
import { assertMembershipTransition } from "@/lib/gym/lifecycle";
import {
  planCashReceipt,
  planDeferredRefund,
  planForfeit,
  planMembershipInvoice,
  planRecognition,
  planSessionConsumption,
  planSessionSale,
} from "@/lib/gym/posting-plan";
import { monthlyRunRate, priceContract, repriceRemaining, taxFromBps } from "@/lib/gym/pricing";
import {
  dailyRecognition,
  monthlyRecognition,
  scheduleTotal,
  sessionRecognition,
  shiftUnrecognised,
} from "@/lib/gym/recognition";
import { classCapacity, findConflict } from "@/lib/gym/scheduling";
import { consumeSessions } from "@/lib/gym/sessions";

describe("gym membership accounting", () => {
  it("recognises an annual prepaid membership in twelve equal months", () => {
    const lines = monthlyRecognition(120_000, "2026-01-15", 12);
    expect(lines).toHaveLength(12);
    expect(lines.every((line) => line.amountMinor === 10_000)).toBe(true);
    expect(scheduleTotal(lines)).toBe(120_000);
    expect(lines[0]?.recogniseOn).toBe("2026-01-15");
    expect(lines[11]?.recogniseOn).toBe("2026-12-15");
  });

  it("puts the rounding remainder on the final recognition line", () => {
    const lines = monthlyRecognition(100, "2026-01-31", 3);
    expect(lines.map((line) => line.amountMinor)).toEqual([33, 33, 34]);
    expect(lines.map((line) => line.recogniseOn)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
    ]);
  });

  it("invoices deferred membership separately from cash and earned revenue", () => {
    const invoice = planMembershipInvoice({
      membershipMinor: 120_000,
      joiningFeeMinor: 0,
      taxMinor: 0,
      joiningFeePolicy: "defer",
    });
    expect(invoice.invoicedMinor).toBe(120_000);
    expect(invoice.earnedMinor).toBe(0);
    expect(invoice.cashMinor).toBe(0);
    expect(invoice.lines).toEqual([
      expect.objectContaining({ account: "accounts_receivable", debitMinor: 120_000 }),
      expect.objectContaining({ account: "deferred_membership_revenue", creditMinor: 120_000 }),
    ]);
    const receipt = planCashReceipt(120_000);
    expect(receipt.cashMinor).toBe(120_000);
    expect(receipt.earnedMinor).toBe(0);
    const recognised = planRecognition(10_000, "January membership");
    expect(recognised.earnedMinor).toBe(10_000);
    expect(recognised.cashMinor).toBe(0);
  });

  it("earns a joining fee immediately only when that is the contract policy", () => {
    const invoice = planMembershipInvoice({
      membershipMinor: 50_000,
      joiningFeeMinor: 5_000,
      taxMinor: taxFromBps(55_000, 1000),
      joiningFeePolicy: "immediate",
    });
    expect(invoice.lines.find((row) => row.account === "joining_fee_revenue")?.creditMinor).toBe(
      5_000,
    );
    expect(invoice.lines.find((row) => row.account === "tax_liability")?.creditMinor).toBe(5_500);
    expect(invoice.earnedMinor).toBe(5_000);
  });

  it("does not earn a cancelled balance unless the contract forfeits it", () => {
    const refund = planDeferredRefund(80_000, "bank");
    expect(refund.earnedMinor).toBe(0);
    expect(refund.cashMinor).toBe(-80_000);
    expect(planForfeit(80_000).earnedMinor).toBe(80_000);
  });

  it("keeps session liability and balances from going negative", () => {
    const sale = planSessionSale(30_000);
    expect(sale.earnedMinor).toBe(0);
    const first = consumeSessions({ remaining: 3, liabilityMinor: 30_000 }, 1);
    expect(first).toMatchObject({ remaining: 2, liabilityMinor: 20_000, recognisedMinor: 10_000 });
    const last = consumeSessions(
      { remaining: first.remaining, liabilityMinor: first.liabilityMinor },
      2,
    );
    expect(last.liabilityMinor).toBe(0);
    expect(planSessionConsumption(last.recognisedMinor).earnedMinor).toBe(20_000);
    expect(() => consumeSessions(last, 1)).toThrow(/Not enough sessions/);
  });

  it("shifts only unrecognised dates across a freeze", () => {
    const shifted = shiftUnrecognised(
      [
        { recogniseOn: "2026-01-01", amountMinor: 100, recognised: true },
        { recogniseOn: "2026-02-01", amountMinor: 100, recognised: false },
      ],
      14,
    );
    expect(shifted[0]?.recogniseOn).toBe("2026-01-01");
    expect(shifted[1]?.recogniseOn).toBe("2026-02-15");
  });

  it("rejects a membership transition that skips the lifecycle", () => {
    expect(() => assertMembershipTransition("active", "pending_payment")).toThrow(/cannot move/);
    expect(() => assertMembershipTransition("cancelled", "active")).not.toThrow();
  });
});

describe("gym commercial calculations", () => {
  it("prices tax from the configured rate and reprices the remaining obligation", () => {
    expect(
      priceContract({ membershipMinor: 120_000, joiningFeeMinor: 0, taxBps: 0 }).totalMinor,
    ).toBe(120_000);
    expect(repriceRemaining(60_000, 120_000, 180_000)).toBe(90_000);
  });

  it("calculates fixed, percentage and tiered commission", () => {
    expect(commissionMinor(10_000, { kind: "fixed", amountMinor: 2_500 })).toBe(2_500);
    expect(commissionMinor(10_000, { kind: "percent", bps: 1500 })).toBe(1_500);
    expect(
      commissionMinor(25_000, {
        kind: "tiered",
        tiers: [
          { upToMinor: 10_000, bps: 1000 },
          { upToMinor: null, bps: 2000 },
        ],
      }),
    ).toBe(5_000);
  });

  it("reports MRR from active recurring memberships and omits passes", () => {
    const revenue = recurringRevenue([
      { priceMinor: 120_000, interval: "year", status: "active" },
      { priceMinor: 2_000, interval: "day", status: "active" },
      { priceMinor: 9_000, interval: "month", status: "frozen" },
    ]);
    expect(revenue).toMatchObject({ mrrMinor: 10_000, arrMinor: 120_000, excludedCount: 1 });
    expect(monthlyRunRate(100, "year")).toEqual({ monthlyMinor: 8, residualMinor: 4 });
  });

  it("returns no retention rate for an empty opening cohort", () => {
    expect(retentionRate(0, 3, 3)).toBeNull();
    expect(retentionRate(10, 8, 1)).toBe(0.7);
    expect(churnRate(10, 8, 1)).toBeCloseTo(0.3);
  });

  it("refuses a churn story when the cohort is too small", () => {
    expect(churnInsight(2, 1).available).toBe(false);
    expect(churnInsight(10, 2).figure).toBe(0.2);
    expect(deferredExceptionInsight(1).explanation).toMatch(
      /not.*earned|before treating it as earned/i,
    );
  });

  it("detects trainer conflicts and class overflow", () => {
    expect(
      findConflict({ startsAt: "2026-03-01T10:00:00.000Z", endsAt: "2026-03-01T11:00:00.000Z" }, [
        { startsAt: "2026-03-01T10:30:00.000Z", endsAt: "2026-03-01T11:30:00.000Z" },
      ]),
    ).not.toBeNull();
    expect(
      findConflict({ startsAt: "2026-03-01T11:00:00.000Z", endsAt: "2026-03-01T12:00:00.000Z" }, [
        { startsAt: "2026-03-01T10:00:00.000Z", endsAt: "2026-03-01T11:00:00.000Z" },
      ]),
    ).toBeNull();
    expect(classCapacity({ capacity: 2, registered: 2 })).toEqual({ remaining: 0, waitlist: true });
  });

  it("separates duplicate member imports from rows that can be saved", () => {
    const plan = planMemberImport(
      [
        { displayName: "Asha", email: "asha@gym.test", status: "active" },
        { displayName: "Asha again", email: "ASHA@gym.test", status: "active" },
        { displayName: "", email: "new@gym.test", status: "prospect" },
      ],
      [],
    );
    expect(plan.ready).toHaveLength(1);
    expect(plan.duplicates).toHaveLength(1);
    expect(plan.errors).toHaveLength(1);
  });

  it("clamps month-end anniversaries", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(
      dailyRecognition(300, "2026-01-01", "2026-01-03").map((line) => line.amountMinor),
    ).toEqual([100, 100, 100]);
    expect(sessionRecognition(100, 3)).toEqual([33, 33, 34]);
  });
});
