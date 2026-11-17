import { describe, expect, it } from "vitest";
import {
  isWithinMessagingLatencyBudget,
  isWithinMessagingSizeBudget,
  MESSAGING_LATENCY_BUDGETS_MS,
  summariseMessagingLatencyBreaches,
} from "./performance";

describe("messaging performance budgets", () => {
  it("keeps inbox and send budgets defined", () => {
    expect(MESSAGING_LATENCY_BUDGETS_MS.inboxListMs).toBeLessThanOrEqual(1000);
    expect(MESSAGING_LATENCY_BUDGETS_MS.sendAckMs).toBeLessThanOrEqual(2000);
  });

  it("detects latency and size budget breaches", () => {
    expect(isWithinMessagingLatencyBudget({ operation: "inboxListMs", elapsedMs: 100 })).toBe(true);
    expect(isWithinMessagingLatencyBudget({ operation: "threadLoadMs", elapsedMs: 5_000 })).toBe(
      false,
    );
    expect(isWithinMessagingSizeBudget("maxMessagesPerThreadFetch", 200)).toBe(true);
    expect(isWithinMessagingSizeBudget("maxMessagesPerThreadFetch", 201)).toBe(false);
    expect(
      summariseMessagingLatencyBreaches([
        { operation: "sendAckMs", elapsedMs: 100 },
        { operation: "attachmentRegisterMs", elapsedMs: 9_000 },
      ]),
    ).toHaveLength(1);
  });
});
