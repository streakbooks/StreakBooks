import { describe, expect, it } from "vitest";
import { allocateDevelopmentCost } from "./allocation";
import { splitCommission } from "./commissions";
import { parseUnitCsv } from "./csv";
import { internalRateOfReturnBps, netPresentValue } from "./forecast";
import { addMonths, buildInstalmentSchedule, suggestedLateFeeMinor } from "./instalments";
import { assessRecognition, recognitionAmounts } from "./recognition";
import { genericTransitions, pricePerAreaMinor, statusEdgeAllowed } from "./status";

describe("real estate inventory rules", () => {
  it("keeps reservation off the generic status screen", () => {
    expect(genericTransitions("available")).not.toContain("reserved");
    expect(statusEdgeAllowed("available", "reserved")).toBe(true);
    expect(statusEdgeAllowed("reserved", "booked")).toBe(true);
    expect(statusEdgeAllowed("handed_over", "available")).toBe(false);
  });

  it("prices a unit from saleable area", () => {
    expect(pricePerAreaMinor(1250000, 50)).toBe(25000);
    expect(pricePerAreaMinor(100, 0)).toBeNull();
  });
});

describe("instalment schedules", () => {
  it("builds a deposit, monthly instalments and a handover that sum to the contract", () => {
    const lines = buildInstalmentSchedule({
      contractMinor: 100000,
      startOn: "2026-01-31",
      depositMinor: 10000,
      instalmentCount: 3,
      frequency: "monthly",
      handoverMinor: 15000,
      handoverOn: "2026-06-30",
    });
    expect(lines.map((line) => line.amountMinor)).toEqual([10000, 25000, 25000, 25000, 15000]);
    expect(lines[1]?.dueOn).toBe("2026-02-28");
    expect(lines.reduce((sum, line) => sum + line.amountMinor, 0)).toBe(100000);
  });

  it("keeps milestone percentages exact after rounding", () => {
    const lines = buildInstalmentSchedule({
      contractMinor: 100,
      startOn: "2026-03-01",
      milestones: [
        { label: "Foundation", dueOn: "2026-04-01", percentBps: 3333 },
        { label: "Structure", dueOn: "2026-08-01", percentBps: 3333 },
        { label: "Completion", dueOn: "2026-12-01", percentBps: 3334 },
      ],
    });
    expect(lines.map((line) => line.amountMinor)).toEqual([33, 33, 34]);
  });

  it("moves month ends without inventing a day", () => {
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
  });

  it("suggests a late fee only after the grace period and does not post it", () => {
    expect(suggestedLateFeeMinor(10000, 5, 7, 200)).toBe(0);
    expect(suggestedLateFeeMinor(10000, 10, 7, 200)).toBe(200);
  });
});

describe("commissions and cost allocation", () => {
  it("shares a tiered commission without losing a minor unit", () => {
    const result = splitCommission({
      baseMinor: 150000,
      tiers: [
        { uptoMinor: 100000, rateBps: 200 },
        { uptoMinor: 200000, rateBps: 300 },
      ],
      withholdingBps: 1000,
      shares: [
        { id: "a", bps: 5000 },
        { id: "b", bps: 5000 },
      ],
    });
    expect(result.grossMinor).toBe(2000 + 1500);
    expect(result.withholdingMinor).toBe(350);
    expect(result.shares.reduce((sum, share) => sum + share.amountMinor, 0)).toBe(result.netMinor);
  });

  it("allocates a pool by saleable area and keeps the total", () => {
    const lines = allocateDevelopmentCost("saleable_area", 100, [
      { id: "a", weight: 1 },
      { id: "b", weight: 1 },
      { id: "c", weight: 1 },
    ]);
    expect(lines.reduce((sum, line) => sum + line.amountMinor, 0)).toBe(100);
    expect(lines.map((line) => line.amountMinor).sort()).toEqual([33, 33, 34]);
  });

  it("refuses to spread a direct cost across two properties", () => {
    expect(() =>
      allocateDevelopmentCost("direct", 500, [
        { id: "a", weight: 1 },
        { id: "b", weight: 1 },
      ]),
    ).toThrow(/exactly one property/);
  });
});

describe("revenue recognition gate", () => {
  it("refuses to treat cash or an unsigned policy as revenue", () => {
    expect(
      assessRecognition({
        policy: "point_in_time",
        trigger: "cash",
        controlTransferred: true,
        overTimeCriteriaMet: false,
        approved: true,
        calculationRef: "CALC-1",
        evidenceNote: "Control transferred on handover.",
      }).allowed,
    ).toBe(false);
    expect(
      assessRecognition({
        policy: "unset",
        trigger: "manual",
        controlTransferred: true,
        overTimeCriteriaMet: false,
        approved: true,
        calculationRef: "CALC-1",
        evidenceNote: "Control transferred on handover.",
      }).allowed,
    ).toBe(false);
  });

  it("splits recognised revenue between the deposit liability and a contract asset", () => {
    const amounts = recognitionAmounts({
      mode: "point_in_time",
      contractMinor: 1000,
      collectedMinor: 400,
      recognisedMinor: 0,
      liabilityAppliedMinor: 0,
      cosRecognisedMinor: 0,
      requestedMinor: 1000,
    });
    expect(amounts.fromLiabilityMinor + amounts.contractAssetMinor).toBe(amounts.revenueMinor);
    expect(amounts).toMatchObject({
      fromLiabilityMinor: 400,
      contractAssetMinor: 600,
      cosMinor: 0,
    });
  });

  it("measures over-time revenue and cost from progress", () => {
    const amounts = recognitionAmounts({
      mode: "over_time",
      contractMinor: 100000,
      collectedMinor: 20000,
      recognisedMinor: 0,
      liabilityAppliedMinor: 0,
      cosRecognisedMinor: 0,
      progressBps: 2500,
      estimatedCostMinor: 80000,
    });
    expect(amounts.revenueMinor).toBe(25000);
    expect(amounts.fromLiabilityMinor).toBe(20000);
    expect(amounts.contractAssetMinor).toBe(5000);
    expect(amounts.cosMinor).toBe(20000);
  });
});

describe("forecasts and import", () => {
  it("discounts cash flows and solves a one-period return", () => {
    expect(netPresentValue(0, [-100, 40, 60])).toBe(0);
    expect(internalRateOfReturnBps([-100, 110])).toBe(1000);
  });

  it("parses an inventory CSV and rejects a sold status", () => {
    const rows = parseUnitCsv(
      "unit_code,kind,saleable_area,list_price_minor\nA-1,apartment,42.5,900000\n",
    );
    expect(rows[0]).toMatchObject({ unitCode: "A-1", listPriceMinor: 900000, status: "available" });
    expect(() =>
      parseUnitCsv("unit_code,kind,list_price_minor,status\nA-1,apartment,1,sold\n"),
    ).toThrow(/cannot be imported/);
  });
});
