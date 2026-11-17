import { describe, expect, it } from "vitest";
import { buildMessagingAttachmentPath, validateMessagingUpload } from "./attachments";

describe("messaging attachments", () => {
  it("builds tenant-scoped storage paths", () => {
    const path = buildMessagingAttachmentPath({
      companyId: "11111111-1111-4111-8111-111111111111",
      conversationId: "22222222-2222-4222-8222-222222222222",
      uniqueId: "33333333-3333-4333-8333-333333333333",
      fileName: "quote.pdf",
    });
    expect(path).toContain("11111111-1111-4111-8111-111111111111/");
    expect(path).toContain("/22222222-2222-4222-8222-222222222222/");
    expect(path.endsWith("-quote.pdf")).toBe(true);
  });

  it("rejects disallowed mime types and oversized files", () => {
    expect(
      validateMessagingUpload({
        fileName: "x.exe",
        sizeBytes: 10,
        contentType: "application/x-msdownload",
      }).ok,
    ).toBe(false);
    expect(
      validateMessagingUpload({
        fileName: "big.pdf",
        sizeBytes: 20_000_000,
        contentType: "application/pdf",
        maxBytes: 5_000_000,
      }).ok,
    ).toBe(false);
    expect(
      validateMessagingUpload({
        fileName: "ok.pdf",
        sizeBytes: 100,
        contentType: "application/pdf",
      }),
    ).toEqual({ ok: true });
  });
});
