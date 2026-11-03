import { readdirSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { FEATURE_REGISTRY, FEATURE_DEPENDENCIES } from "@/lib/platform/feature-registry";
import { resolveEntitlement, dependencyIssues } from "@/lib/platform/entitlements";
describe("reporting suite commercial access", () => {
  it("orders catalogue migrations after their billing prerequisites for fresh databases", () => {
    const files = readdirSync("supabase/migrations").sort();
    const position = (suffix: string) => files.findIndex((name) => name.endsWith(suffix));
    const catalogue = position("_reporting_catalogue_entitlements.sql");
    expect(catalogue).toBeGreaterThan(position("_entitlement_price_book.sql"));
    expect(catalogue).toBeGreaterThan(position("_rollout_enforcement.sql"));
    expect(position("_reporting_revoke_while_frozen.sql")).toBeGreaterThan(catalogue);
  });
  it("includes the existing suite without metered charges and declares its accounting dependency", () => {
    const feature = FEATURE_REGISTRY.find((f) => f.key === "reporting")!;
    expect(feature).toMatchObject({
      defaultEnabled: true,
      metering: "none",
      costTag: null,
      status: "live",
    });
    expect(dependencyIssues(["reporting"], FEATURE_DEPENDENCIES)).toContainEqual(
      expect.objectContaining({ featureKey: "reporting", kind: "missing", otherKey: "accounting" }),
    );
    expect(dependencyIssues(["reporting", "accounting"], FEATURE_DEPENDENCIES)).toEqual([]);
  });
  it("does not let an included suite or complimentary grant bypass a kill switch", () => {
    const decision = resolveEntitlement(
      "reporting",
      [
        {
          featureKey: "reporting",
          source: "grant",
          scope: "business",
          effect: "allow",
          reason: "Included reporting",
        },
        {
          featureKey: "reporting",
          source: "kill_switch",
          scope: "global",
          effect: "deny",
          reason: "Service paused",
        },
      ],
      new Date("2026-11-02T00:00:00Z"),
    );
    expect(decision).toMatchObject({ allowed: false, source: "kill_switch" });
  });
});
