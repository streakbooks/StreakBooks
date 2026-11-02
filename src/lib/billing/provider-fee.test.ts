import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { recordProviderFee } from "./provider-fee";

describe("provider fees", () => {
  it("keeps a missing fee unavailable", () => {
    expect(
      recordProviderFee({
        role: "platform_finance",
        grossMinor: 1000,
        feeMinor: null,
        reason: "Statement",
      }),
    ).toMatchObject({
      stored: false,
      providerCalled: false,
      net: { status: "unavailable", minor: null },
    });
  });

  it("subtracts a stored fee and does not call a provider", () => {
    expect(
      recordProviderFee({
        role: "platform_finance",
        grossMinor: 1000,
        feeMinor: 30,
        reason: "Statement",
      }).net,
    ).toEqual({ status: "stored", minor: 970 });
    expect(() =>
      recordProviderFee({
        role: "platform_support",
        grossMinor: 1000,
        feeMinor: 30,
        reason: "Statement",
      }),
    ).toThrow(/permission/);
    const sql = readFileSync(
      new URL("../../../supabase/migrations/20261102340000_provider_fees.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("READY-TO-APPLY");
    expect(sql).toContain("fee_minor integer NOT NULL");
    expect(sql).toContain("That provider charge already has a fee");
    expect(sql).not.toContain("stripe.com");
  });

  it("rejects a fee larger than the charge", () => {
    expect(() =>
      recordProviderFee({
        role: "platform_finance",
        grossMinor: 30,
        feeMinor: 1000,
        reason: "Statement",
      }),
    ).toThrow(/cannot exceed/);
    const sql = readFileSync(
      new URL(
        "../../../supabase/migrations/20261102450000_provider_fee_within_gross.sql",
        import.meta.url,
      ),
      "utf8",
    );
    expect(sql).toContain("A fee cannot exceed the charge");
    expect(sql).toContain("fee_minor <= gross_minor");
    expect(sql).toContain("require_platform('billing.manage')");
  });
});
