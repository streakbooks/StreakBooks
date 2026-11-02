import { describe, expect, it } from "vitest";
import { usageOverageInvoice } from "./usage-invoice";

describe("usage overage invoice", () => {
  it("does not draft an invoice when usage stays inside the included quantity", () => {
    expect(usageOverageInvoice({ usedQty: 10, includedQty: 10, unitAmountMinor: 5 })).toMatchObject(
      {
        status: "none",
        posted: false,
        providerCalled: false,
      },
    );
  });

  it("leaves an unpriced overage unposted", () => {
    expect(usageOverageInvoice({ usedQty: 12, includedQty: 10, unitAmountMinor: null })).toEqual({
      status: "unpriced",
      posted: false,
      providerCalled: false,
      quantity: 2,
      netMinor: null,
    });
  });

  it("drafts the integer overage and does not post it", () => {
    expect(usageOverageInvoice({ usedQty: 12, includedQty: 10, unitAmountMinor: 25 })).toEqual({
      status: "draft",
      posted: false,
      providerCalled: false,
      quantity: 2,
      netMinor: 50,
    });
  });
});
