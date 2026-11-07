import { describe, expect, it } from "vitest";
import {
  buildRebillSalesLines,
  calculateRebillNetMinor,
  canPrepareClaimForRebilling,
} from "./rebilling";

describe("calculateRebillNetMinor", () => {
  it("returns actual amounts unchanged", () => {
    expect(calculateRebillNetMinor({ netMinor: 1250, method: "actual" })).toBe(1250);
  });

  it("applies markup basis points", () => {
    expect(
      calculateRebillNetMinor({ netMinor: 10000, method: "markup", markupBps: 1000 }),
    ).toBe(11000);
  });

  it("uses agreed rate × quantity", () => {
    expect(
      calculateRebillNetMinor({
        netMinor: 0,
        method: "agreed_rate",
        agreedRateMinor: 500,
        quantity: 3,
      }),
    ).toBe(1500);
  });
});

describe("canPrepareClaimForRebilling", () => {
  it("blocks already invoiced claims", () => {
    expect(
      canPrepareClaimForRebilling({
        rebillingStatus: "invoiced",
        rebillingInvoiceId: "inv-1",
        hasLines: true,
      }).ok,
    ).toBe(false);
  });
});

describe("buildRebillSalesLines", () => {
  it("maps billable lines onto the income account", () => {
    const result = buildRebillSalesLines({
      incomeAccountId: "inc-1",
      lines: [
        { description: "Flights", netMinor: 40000, isBillable: true },
        { description: "Personal", netMinor: 2000, isBillable: false },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]?.accountId).toBe("inc-1");
    expect(result.lines[0]?.unitPriceMinor).toBe(40000);
  });
});
