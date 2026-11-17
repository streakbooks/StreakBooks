import { describe, expect, it } from "vitest";
import { buildMessagingDigestPreview, isSensitiveMessagingPreview } from "./digests";

describe("messaging digests", () => {
  it("flags sensitive previews", () => {
    expect(isSensitiveMessagingPreview("Please send IBAN tonight")).toBe(true);
    expect(isSensitiveMessagingPreview("Can we discuss the invoice?")).toBe(false);
  });

  it("omits HR/private and sensitive rows from digests", () => {
    const preview = buildMessagingDigestPreview({
      companyName: "Acme",
      frequency: "daily",
      candidates: [
        {
          conversationId: "1",
          title: "Invoice chat",
          preview: "Need a copy",
          unreadCount: 2,
          visibility: "internal",
          lastMessageAt: "2026-11-17T10:00:00Z",
        },
        {
          conversationId: "2",
          title: "Leave",
          preview: "Private",
          unreadCount: 1,
          visibility: "hr_private",
          lastMessageAt: "2026-11-17T11:00:00Z",
        },
        {
          conversationId: "3",
          title: "Treasury",
          preview: "Update the bank account number",
          unreadCount: 3,
          visibility: "internal",
          lastMessageAt: "2026-11-17T12:00:00Z",
        },
      ],
    });
    expect(preview.subject).toContain("daily Messages digest");
    expect(preview.items).toHaveLength(1);
    expect(preview.items[0]?.title).toBe("Invoice chat");
    expect(preview.omittedSensitive).toBe(2);
  });
});
