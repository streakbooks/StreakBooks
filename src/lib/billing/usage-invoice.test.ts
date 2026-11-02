import { readFileSync } from "node:fs";
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

  it("keeps the saved draft unposted", () => {
    const sql = readFileSync(
      new URL("../../../supabase/migrations/20261102370000_usage_drafts.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("READY-TO-APPLY");
    expect(sql).toContain("posted boolean NOT NULL DEFAULT false CHECK (posted = false)");
    expect(sql).not.toContain("sales_invoices");
  });
});
