import { describe, expect, it } from "vitest";
import { messagingAiDisclosure, runMessagingAiAssist } from "./ai-assist";

describe("messaging AI assist", () => {
  it("fails closed without authorised context", () => {
    expect(
      runMessagingAiAssist({
        companyId: "00000000-0000-4000-8000-000000000001",
        conversationId: "00000000-0000-4000-8000-000000000002",
        capability: "summarize_conversation",
        authorisedContext: [],
      }).ok,
    ).toBe(false);
  });

  it("refuses external send confirmation until provider is wired", () => {
    const result = runMessagingAiAssist({
      companyId: "00000000-0000-4000-8000-000000000001",
      conversationId: "00000000-0000-4000-8000-000000000002",
      capability: "suggest_reply",
      authorisedContext: ["Hello"],
      userConfirmedExternalSend: true,
    });
    expect(result.ok).toBe(false);
    expect(result.reason.toLowerCase()).toContain("external");
  });

  it("discloses non-accounting autonomy", () => {
    expect(messagingAiDisclosure().toLowerCase()).toContain("cannot approve");
  });
});
