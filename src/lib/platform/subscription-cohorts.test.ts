import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { subscriptionStartCohorts } from "./subscription-cohorts";

describe("subscription start cohorts", () => {
  it("keeps a missing start out of every month and does not read a last update", () => {
    expect(
      subscriptionStartCohorts([
        { startedAt: null, status: "trialing" },
        { startedAt: "2026-10-31T06:33:11.167Z", status: "trialing" },
        { startedAt: "2026-10-02T00:00:00.000Z", status: "active" },
        { startedAt: "2026-11-01T00:00:00.000Z", status: "custom" },
      ]),
    ).toEqual({
      unknownStart: 1,
      months: [
        {
          month: "2026-10",
          trialing: 1,
          active: 1,
          past_due: 0,
          cancelled: 0,
          expired: 0,
          complimentary: 0,
          paused: 0,
          other: 0,
          total: 2,
        },
        {
          month: "2026-11",
          trialing: 0,
          active: 0,
          past_due: 0,
          cancelled: 0,
          expired: 0,
          complimentary: 0,
          paused: 0,
          other: 1,
          total: 1,
        },
      ],
    });
    const sql = readFileSync(
      "supabase/migrations/20261102160000_subscription_start_cohorts.sql",
      "utf8",
    );
    expect(sql).toContain("Do not backfill");
    expect(sql).toContain("s.started_at IS NULL");
    expect(sql).not.toContain("updated_at");
    expect(sql).toContain("subscriptions.view");
  });
});
