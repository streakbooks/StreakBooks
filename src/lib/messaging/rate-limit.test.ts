import { describe, expect, it } from "vitest";
import {
  canSendMessagingNow,
  createMessagingSendPaceState,
  MESSAGING_SEND_RATE,
  recordMessagingSend,
} from "./rate-limit";

describe("messaging send rate limit", () => {
  it("allows paced sends under the minute budget", () => {
    let state = createMessagingSendPaceState();
    const first = canSendMessagingNow(state, 1_000);
    expect(first.ok).toBe(true);
    state = recordMessagingSend(state, 1_000);
    expect(canSendMessagingNow(state, 1_000 + MESSAGING_SEND_RATE.minIntervalMs).ok).toBe(true);
  });

  it("blocks bursts faster than min interval", () => {
    let state = createMessagingSendPaceState();
    state = recordMessagingSend(state, 5_000);
    const blocked = canSendMessagingNow(state, 5_100);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("blocks after maxPerMinute in a rolling window", () => {
    let state = createMessagingSendPaceState();
    const start = 100_000;
    for (let i = 0; i < MESSAGING_SEND_RATE.maxPerMinute; i += 1) {
      state = recordMessagingSend(state, start + i * 1_000);
    }
    const blocked = canSendMessagingNow(
      state,
      start + MESSAGING_SEND_RATE.maxPerMinute * 1_000,
    );
    expect(blocked.ok).toBe(false);
  });
});
