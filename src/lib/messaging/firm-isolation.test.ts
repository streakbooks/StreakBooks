import { describe, expect, it } from "vitest";
import { assertFirmClientConversationIsolation } from "./firm-isolation";

describe("firm client isolation", () => {
  it("allows matching client contexts", () => {
    expect(
      assertFirmClientConversationIsolation({
        firmUserId: "firm-1",
        clientCompanyId: "co-a",
        conversationCompanyId: "co-a",
        membershipCompanyId: "co-a",
      }).ok,
    ).toBe(true);
  });

  it("denies cross-client conversation leakage", () => {
    const result = assertFirmClientConversationIsolation({
      firmUserId: "firm-1",
      clientCompanyId: "co-a",
      conversationCompanyId: "co-b",
      membershipCompanyId: "co-a",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.toLowerCase()).toContain("conversation company");
  });
});
