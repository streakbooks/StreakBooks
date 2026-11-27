import { describe, expect, it } from "vitest";
import {
  friendlyStripePlanChangeError,
  stripePlanChangeIdempotencyKey,
} from "@/lib/billing/providers/stripe.server";

describe("stripe plan change helpers", () => {
  it("builds a unique idempotency key per attempt", () => {
    const a = stripePlanChangeIdempotencyKey(
      "25197bd0-0ca6-4ac4-b23e-ea7b8fd31293",
      "0a1a9c15-2602-4fc6-b0fc-2c6f2c7c1e14",
      "upgrade",
    );
    const b = stripePlanChangeIdempotencyKey(
      "25197bd0-0ca6-4ac4-b23e-ea7b8fd31293",
      "0a1a9c15-2602-4fc6-b0fc-2c6f2c7c1e14",
      "upgrade",
    );
    expect(a).not.toBe(b);
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
