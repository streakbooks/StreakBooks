import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { midCycleFeatureChange } from "./proration";
import { planStoredProration } from "./proration-store";

describe("stored proration", () => {
  it("keeps a calculated credit unsent", () => {
    const change = midCycleFeatureChange({
      previousMinor: 3000,
      nextMinor: 0,
      daysRemaining: 10,
      daysInPeriod: 30,
      stripeSecret: null,
    });
    expect(
      planStoredProration({
        role: "platform_finance",
        prorationMinor: change.prorationMinor,
        providerCalled: false,
        reason: "Remove add-on",
      }),
    ).toEqual({ stored: false, providerCalled: false, prorationMinor: -1000 });
  });

  it("refuses support and does not call a provider", () => {
    expect(() =>
      planStoredProration({
        role: "platform_support",
        prorationMinor: 1000,
        providerCalled: false,
        reason: "Add add-on",
      }),
    ).toThrow(/permission/);
    const sql = readFileSync(
      new URL("../../../supabase/migrations/20261102420000_proration_store.sql", import.meta.url),
      "utf8",
    );
    expect(sql).toContain("READY-TO-APPLY");
    expect(sql).toContain(
      "provider_called boolean NOT NULL DEFAULT false CHECK (provider_called = false)",
    );
    expect(sql).not.toContain("stripe.com");
  });
});
