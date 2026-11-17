import { describe, expect, it } from "vitest";
import { buildMessagingThreadExport } from "./export-thread";

describe("messaging thread export", () => {
  it("exports plain text without HTML and marks redacted bodies", () => {
    const text = buildMessagingThreadExport({
      title: "Invoice chat",
      conversationId: "00000000-0000-4000-8000-000000000001",
      messages: [
        {
          id: "m1",
          company_id: "c1",
          conversation_id: "00000000-0000-4000-8000-000000000001",
          seq: 1,
          author_user_id: "u1",
          author_kind: "member",
          body: '<script>alert("x")</script>',
          body_format: "plain",
          reply_to_message_id: null,
          idempotency_key: "k1",
          is_edited: false,
          is_redacted: false,
          is_pinned: false,
          created_at: "2026-11-17T10:00:00Z",
          edited_at: null,
          author_name: "Ada",
        },
        {
          id: "m2",
          company_id: "c1",
          conversation_id: "00000000-0000-4000-8000-000000000001",
          seq: 2,
          author_user_id: "u2",
          author_kind: "member",
          body: "secret",
          body_format: "plain",
          reply_to_message_id: null,
          idempotency_key: "k2",
          is_edited: false,
          is_redacted: true,
          is_pinned: false,
          created_at: "2026-11-17T11:00:00Z",
          edited_at: null,
          author_name: "Bob",
        },
      ],
    });
    expect(text).toContain("Ada");
    expect(text).toContain('<script>alert("x")</script>');
    expect(text).toContain("[Message removed]");
    expect(text).not.toContain("secret");
  });
});
