import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lifetimeValueFromPayments, recordLifetimePayment } from "./lifetime-value";

describe("lifetime value", () => {
  it("does not treat missing history as zero", () => {
    expect(lifetimeValueFromPayments(null)).toEqual({
      status: "unavailable",
      minor: null,
      currency: null,
    });
    expect(lifetimeValueFromPayments([])).toEqual({
      status: "unavailable",
      minor: null,
      currency: null,
    });
  });

  it("sums one currency and keeps mixed currencies unseparated", () => {
    expect(
      lifetimeValueFromPayments([
        { currency: "INR", amountMinor: 1000 },
        { currency: "INR", amountMinor: 500 },
      ]),
    ).toEqual({ status: "stored", minor: 1500, currency: "INR" });
    expect(
      lifetimeValueFromPayments([
        { currency: "INR", amountMinor: 1000 },
        { currency: "USD", amountMinor: 500 },
      ]),
    ).toEqual({ status: "unseparated", minor: null, currency: null });
  });

  it("refuses support and has not been applied", () => {
    expect(() =>
      recordLifetimePayment({
        role: "platform_support",
        currency: "INR",
        amountMinor: 100,
        reason: "Collected",
      }),
    ).toThrow(/permission/);
    const sql = readFileSync(
      new URL("../../../supabase/migrations/20261102360000_lifetime_value.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("READY-TO-APPLY");
    expect(sql).toContain("unavailable");
    expect(sql).not.toContain("sales_invoices");
  });
});
