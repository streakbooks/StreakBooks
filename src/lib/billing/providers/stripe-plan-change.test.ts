import { describe, expect, it } from "vitest";
import {
  friendlyStripePlanChangeError,
  stripePlanChangeIdempotencyKey,
} from "@/lib/billing/providers/stripe.server";

describe("stripe plan change helpers", () => {
  it("reuses the same idempotency key within a 60s preview window", () => {
    // Stay inside one 60s bucket (avoid crossing Math.floor(t/60) boundaries).
    const t = 1_700_000_010;
    const a = stripePlanChangeIdempotencyKey(
      "25197bd0-0ca6-4ac4-b23e-ea7b8fd31293",
      "0a1a9c15-2602-4fc6-b0fc-2c6f2c7c1e14",
      "upgrade",
      t,
    );
    const b = stripePlanChangeIdempotencyKey(
      "25197bd0-0ca6-4ac4-b23e-ea7b8fd31293",
      "0a1a9c15-2602-4fc6-b0fc-2c6f2c7c1e14",
      "upgrade",
      t + 15,
    );
    const nextBucket = stripePlanChangeIdempotencyKey(
      "25197bd0-0ca6-4ac4-b23e-ea7b8fd31293",
      "0a1a9c15-2602-4fc6-b0fc-2c6f2c7c1e14",
      "upgrade",
      t + 120,
    );
    const otherPrice = stripePlanChangeIdempotencyKey(
      "25197bd0-0ca6-4ac4-b23e-ea7b8fd31293",
      "price_other_full_id_kept",
      "upgrade",
      t,
    );
    expect(a).toBe(b);
    expect(a).not.toBe(nextBucket);
    expect(a).not.toBe(otherPrice);
    expect(a).toMatch(/^sb-plan-upgrade-/);
  });

  it("maps idempotency collisions to a retryable customer message", () => {
    expect(
      friendlyStripePlanChangeError(
        "Keys for idempotent requests can only be used with the same parameters they were first used with.",
      ),
    ).toMatch(/already started/i);
  });
});
