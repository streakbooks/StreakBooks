import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  commissionFor,
  commissionReversal,
  normaliseReferralCode,
  partnerPayoutsSwitchOn,
  referralLink,
} from "./partners";

const migration = readFileSync(
  new URL("../../../../supabase/migrations/20261105224027_billing_partners.sql", import.meta.url),
  "utf8",
);

describe("referral codes", () => {
  it("normalises codes and rejects anything else", () => {
    expect(normaliseReferralCode(" ab12cd34ef56 ")).toBe("AB12CD34EF56");
    expect(normaliseReferralCode("AB-12")).toBeNull();
    expect(normaliseReferralCode("")).toBeNull();
    expect(normaliseReferralCode(null)).toBeNull();
  });

  it("builds a pricing link carrying the code", () => {
    expect(referralLink("https://app.example.test", "AB12CD34EF56")).toBe(
      "https://app.example.test/pricing?ref=AB12CD34EF56",
    );
  });
});

describe("payout switch", () => {
  it("is off unless explicitly enabled", () => {
    expect(partnerPayoutsSwitchOn({})).toBe(false);
    expect(partnerPayoutsSwitchOn({ PARTNER_PAYOUTS_ENABLED: "1" })).toBe(false);
    expect(partnerPayoutsSwitchOn({ PARTNER_PAYOUTS_ENABLED: " TRUE " })).toBe(true);
  });

  it("matches the database default", () => {
    expect(migration).toMatch(/payouts_enabled boolean NOT NULL DEFAULT false/);
    expect(migration).toMatch(
      /CHECK \(NOT payouts_enabled OR regulatory_review_reference IS NOT NULL\)/,
    );
    const inserts = migration.match(/INSERT INTO billing\.commission_rules/g) ?? [];
    expect(inserts).toHaveLength(1);
    expect(migration.indexOf("INSERT INTO billing.commission_rules")).toBeGreaterThan(
      migration.indexOf("FUNCTION public.platform_save_commission_rule"),
    );
  });
});

describe("commission", () => {
  it("matches the rehearsed accrual on a GST-inclusive invoice", () => {
    expect(commissionFor(84661n, "INR", { kind: "percent", percentBps: 1000 })).toBe(8466n);
  });

  it("caps fixed commission at the net amount and ignores other currencies", () => {
    const rule = { kind: "fixed", fixedMinor: 5000n, fixedCurrency: "INR" } as const;
    expect(commissionFor(84661n, "INR", rule)).toBe(5000n);
    expect(commissionFor(3000n, "INR", rule)).toBe(3000n);
    expect(commissionFor(84661n, "USD", rule)).toBe(0n);
    expect(commissionFor(0n, "INR", rule)).toBe(0n);
  });

  it("reverses in proportion and never more than remains", () => {
    const half = commissionReversal({
      accrualMinor: 8466n,
      remainingMinor: 8466n,
      creditMinor: 49950n,
      invoiceTotalMinor: 99900n,
      creditedToDateMinor: 49950n,
    });
    expect(half).toBe(4233n);
    const rest = commissionReversal({
      accrualMinor: 8466n,
      remainingMinor: 8466n - half,
      creditMinor: 49950n,
      invoiceTotalMinor: 99900n,
      creditedToDateMinor: 99900n,
    });
    expect(half + rest).toBe(8466n);
    expect(
      commissionReversal({
        accrualMinor: 10n,
        remainingMinor: 1n,
        creditMinor: 90n,
        invoiceTotalMinor: 100n,
        creditedToDateMinor: 90n,
      }),
    ).toBe(1n);
  });
});
