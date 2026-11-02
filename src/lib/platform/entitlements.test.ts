import { describe, expect, it } from "vitest";
import { FEATURE_DEPENDENCIES } from "./feature-registry";
import {
  dependencyIssues,
  removalKeepsHistory,
  resolveEntitlement,
  rolloutBucket,
  rolloutIncludes,
  type EntitlementAssignment,
} from "./entitlements";

const now = new Date("2026-11-02T12:00:00.000Z");

function row(
  source: EntitlementAssignment["source"],
  scope: EntitlementAssignment["scope"],
  effect: EntitlementAssignment["effect"],
  extra: Partial<EntitlementAssignment> = {},
): EntitlementAssignment {
  return {
    featureKey: "ai_queries",
    source,
    scope,
    effect,
    reason: `${source} ${scope} ${effect}`,
    ...extra,
  };
}

describe("entitlement resolution", () => {
  it("applies source order, then scope, then deny over allow", () => {
    const decision = resolveEntitlement(
      "ai_queries",
      [
        row("default", "global", "allow"),
        row("plan", "plan", "deny"),
        row("trial", "business", "allow"),
        row("addon", "business", "allow"),
        row("grant", "firm", "allow"),
        row("revoke", "business", "deny"),
        row("grant", "user", "allow"),
        row("suspension", "business", "deny"),
        row("kill_switch", "global", "deny"),
        row("kill_switch", "user", "allow"),
      ],
      now,
    );
    expect(decision).toMatchObject({ allowed: true, source: "kill_switch", scope: "user" });
  });

  it("lets a global kill switch beat a user grant", () => {
    const decision = resolveEntitlement(
      "ai_queries",
      [row("grant", "user", "allow"), row("kill_switch", "global", "deny")],
      now,
    );
    expect(decision).toMatchObject({ allowed: false, source: "kill_switch", scope: "global" });
  });

  it("lets suspension beat a complimentary grant", () => {
    const decision = resolveEntitlement(
      "ai_queries",
      [row("grant", "business", "allow"), row("suspension", "business", "deny")],
      now,
    );
    expect(decision.allowed).toBe(false);
    expect(decision.source).toBe("suspension");
  });

  it("lets an explicit revoke beat a manual grant at the same scope", () => {
    const decision = resolveEntitlement(
      "ai_queries",
      [row("grant", "business", "allow"), row("revoke", "business", "deny")],
      now,
    );
    expect(decision).toMatchObject({ allowed: false, source: "revoke" });
  });

  it("lets the more specific scope win inside one source", () => {
    const decision = resolveEntitlement(
      "ai_queries",
      [row("grant", "firm", "deny"), row("grant", "business", "allow")],
      now,
    );
    expect(decision).toMatchObject({ allowed: true, scope: "business" });
  });

  it("lets deny beat allow at the same source and scope", () => {
    const decision = resolveEntitlement(
      "ai_queries",
      [row("grant", "business", "allow"), row("grant", "business", "deny")],
      now,
    );
    expect(decision.allowed).toBe(false);
  });

  it("ignores expired and future assignments", () => {
    const decision = resolveEntitlement(
      "ai_queries",
      [
        row("grant", "business", "allow", { expiresAt: "2026-11-01T00:00:00.000Z" }),
        row("revoke", "business", "deny", { startsAt: "2026-12-01T00:00:00.000Z" }),
        row("plan", "plan", "allow"),
      ],
      now,
    );
    expect(decision).toMatchObject({ allowed: true, source: "plan" });
  });

  it("falls back when nothing is configured", () => {
    expect(resolveEntitlement("missing", [], now).allowed).toBe(false);
  });

  it("blocks a feature whose requirement is absent and a conflicting pair", () => {
    const missing = dependencyIssues(["bank_feeds"], FEATURE_DEPENDENCIES);
    expect(missing.map((issue) => issue.otherKey)).toEqual(["bank_import"]);
    const conflict = dependencyIssues(
      ["inventory", "purchases", "projects"],
      [
        { featureKey: "inventory", requires: ["purchases"], conflicts: ["projects"], optional: [] },
        { featureKey: "projects", requires: [], conflicts: ["inventory"], optional: [] },
      ],
    );
    expect(conflict.some((issue) => issue.kind === "conflict")).toBe(true);
    expect(dependencyIssues(["white_label", "client_portal"], FEATURE_DEPENDENCIES)).toEqual([]);
  });

  it("keeps percentage membership stable when the percentage rises", () => {
    const sample = { organisationId: "org-1", featureKey: "ai_queries" };
    const bucket = rolloutBucket(sample.organisationId, sample.featureKey);
    const base = {
      ...sample,
      allowlist: [],
      organisationRegion: "GB",
      targetRegion: "GB",
      internal: false,
      trialing: false,
      now,
      startsAt: null,
      endsAt: null,
      percent: bucket,
    };
    expect(rolloutIncludes({ ...base, mode: "percentage" }).included).toBe(false);
    expect(rolloutIncludes({ ...base, mode: "percentage", percent: bucket + 1 }).included).toBe(
      true,
    );
    expect(rolloutIncludes({ ...base, mode: "killed" }).included).toBe(false);
    expect(
      rolloutIncludes({ ...base, mode: "scheduled", startsAt: "2026-11-03T00:00:00.000Z" })
        .included,
    ).toBe(false);
    expect(rolloutIncludes({ ...base, mode: "allowlist", allowlist: ["org-1"] }).included).toBe(
      true,
    );
  });

  it("never deletes accounting data when a feature is removed", () => {
    expect(removalKeepsHistory().deletesAccountingData).toBe(false);
  });
});
