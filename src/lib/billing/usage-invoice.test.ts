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
    const guard = readFileSync(
      new URL("../../../supabase/migrations/20261102390000_usage_draft_guard.sql", import.meta.url),
      "utf8",
    );
    expect(guard).toContain("An unpriced draft has no amount");
    expect(guard).toContain("posted', false");
    const quantity = readFileSync(
      new URL("../../../supabase/migrations/20261102400000_usage_draft_quantity.sql", import.meta.url),
      "utf8",
    );
    expect(quantity).toContain("Usage inside the included quantity is zero");
    expect(quantity).toContain("quantity = 0");
  });

  it("keeps one unposted draft per business", () => {
    const sql = readFileSync(
      new URL("../../../supabase/migrations/20261102550000_usage_draft_one.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("billing_usage_drafts_one_company");
    expect(sql).toContain("SET status = _status");
    expect(sql).toContain("'posted', false");
    expect(sql).toContain("require_platform('billing.manage')");
    expect(sql).not.toContain("sales_invoices");
    expect(sql).not.toContain("provider_called = true");
  });
});
