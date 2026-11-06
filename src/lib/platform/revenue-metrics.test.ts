import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FEATURE_REGISTRY } from "./feature-registry";
import {
  arrFromMrrMinor,
  mrrMovement,
  normalisedMrrMinor,
  openingMrrBaseline,
  revenueCardState,
  reconcileMrr,
  storedMrrMovement,
  sumMrrMovements,
} from "./revenue-metrics";
import { formatConsoleInstant, formatUtcDay } from "./console-time";

describe("revenue definitions", () => {
  it("normalises an annual contract by dividing by 12 and derives ARR from MRR", () => {
    expect(normalisedMrrMinor(1200, "year")).toBe(100);
    expect(normalisedMrrMinor(1000, "year")).toBe(83);
    expect(arrFromMrrMinor(83)).toBe(996);
    expect(normalisedMrrMinor(2500, "month")).toBe(2500);
  });

  it("classifies new, expansion, contraction and churned MRR", () => {
    expect(mrrMovement(0, 500).newMinor).toBe(500);
    expect(mrrMovement(500, 800)).toMatchObject({ expansionMinor: 300, netNewMinor: 300 });
    expect(mrrMovement(800, 700)).toMatchObject({ contractionMinor: 100, netNewMinor: -100 });
    expect(mrrMovement(700, 0)).toMatchObject({ churnedMinor: 700, netNewMinor: -700 });
  });

  it("stores a movement only when recognised MRR changes, and sums a portfolio", () => {
    expect(storedMrrMovement(0, 500)).toMatchObject({ movement: "new", deltaMinor: 500 });
    expect(storedMrrMovement(500, 800)).toMatchObject({ movement: "expansion", deltaMinor: 300 });
    expect(storedMrrMovement(800, 700)).toMatchObject({
      movement: "contraction",
      deltaMinor: -100,
    });
    expect(storedMrrMovement(700, 0)).toMatchObject({ movement: "churn", deltaMinor: -700 });
    expect(storedMrrMovement(700, 700).movement).toBe("unchanged");
    expect(openingMrrBaseline(500)).toMatchObject({
      movement: "baseline",
      previousMinor: 500,
      deltaMinor: 0,
    });
    expect(sumMrrMovements([mrrMovement(0, 500), mrrMovement(200, 0)])).toMatchObject({
      newMinor: 500,
      churnedMinor: 200,
      netNewMinor: 300,
    });
    const sql = readFileSync("supabase/migrations/20261102140000_mrr_movements.sql", "utf8");
    expect(sql).toContain("movement IN ('baseline', 'new', 'expansion', 'contraction', 'churn')");
    expect(sql).toContain("s.status = 'active'");
    expect(sql).toContain("NOT c.is_demo");
    expect(sql).toContain("p.currency IS DISTINCT FROM a.currency");
    expect(sql).toContain("MRR movements are append-only");
  });

  it("reconciles the latest stored position with the overview and does not treat a gap as zero", () => {
    expect(reconcileMrr({ overview: [], stored: [] }).state).toBe("empty");
    expect(
      reconcileMrr({
        overview: [{ companyId: "a", currency: "USD", mrrMinor: 3000 }],
        stored: [],
      }),
    ).toMatchObject({
      state: "uncovered",
      missingFromStore: ["a"],
      rows: [{ currency: "USD", overviewMinor: 3000, storedMinor: 0, differenceMinor: 3000 }],
    });
    expect(
      reconcileMrr({
        overview: [{ companyId: "a", currency: "USD", mrrMinor: 3000 }],
        stored: [{ companyId: "a", currency: "USD", currentMinor: 3000 }],
      }).state,
    ).toBe("match");
    expect(
      reconcileMrr({
        overview: [{ companyId: "a", currency: "USD", mrrMinor: 3000 }],
        stored: [{ companyId: "a", currency: "GBP", currentMinor: 3000 }],
      }),
    ).toMatchObject({ state: "mismatch", drift: ["a"] });
    expect(
      reconcileMrr({
        overview: [],
        stored: [{ companyId: "b", currency: "USD", currentMinor: 0 }],
      }).state,
    ).toBe("empty");
    expect(
      reconcileMrr({
        overview: [],
        stored: [{ companyId: "b", currency: "USD", currentMinor: 500 }],
      }),
    ).toMatchObject({ state: "mismatch", extraInStore: ["b"], rows: [{ differenceMinor: -500 }] });
    const sql = readFileSync("supabase/migrations/20261102150000_mrr_reconciliation.sql", "utf8");
    expect(sql).toContain("private.platform_can('billing.view')");
    expect(sql).toContain("(m.current_mrr_minor > 0) DESC");
    expect(sql).toContain("THEN 'uncovered'");
    expect(sql).toContain("NOT c.is_demo");
    expect(sql).toContain("s.status = 'active'");
  });

  it("separates an empty revenue card from a missing permission", () => {
    expect(revenueCardState({ revenueState: "empty", rows: [] })).toBe("empty");
    expect(revenueCardState({ revenueState: "forbidden", rows: [] })).toBe("forbidden");
    expect(revenueCardState({ revenueState: "ok", rows: [{ currency: "GBP" }] })).toBe("ok");
    expect(revenueCardState({ rows: [] })).toBe("unseparated");
  });
});

describe("console dates", () => {
  it("labels an instant with the zone and formats a UTC calendar day", () => {
    expect(formatConsoleInstant("2026-11-02T18:30:00.000Z", "UTC")).toContain("UTC");
    expect(formatUtcDay("2026-11-02")).toContain("2026");
  });
});

describe("feature catalogue", () => {
  it("is registered in the entitlement migration", () => {
    const sql = readdirSync("supabase/migrations")
      .filter(
        (name) =>
          name.endsWith("_entitlement_price_book.sql") ||
          name.endsWith("_catalogue_entitlements.sql") ||
          name.endsWith("_billing_plans_catalogue.sql"),
      )
      .sort()
      .map((name) => readFileSync(`supabase/migrations/${name}`, "utf8"))
      .join("\n");
    for (const feature of FEATURE_REGISTRY) expect(sql).toContain(`'${feature.key}'`);
    expect(sql).toContain("kill_switch suspension revoke grant addon trial plan default");
    expect(sql).toContain("user business firm plan global");
    expect(new Set(FEATURE_REGISTRY.map((feature) => feature.key)).size).toBe(
      FEATURE_REGISTRY.length,
    );
  });
});
