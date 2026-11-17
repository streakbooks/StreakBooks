import { describe, expect, it } from "vitest";
import {
  compareMessageSeq,
  escapeMessagingText,
  isAllowedMessagingMime,
  isMessagingUuid,
  normaliseGroupTitle,
  normaliseMessageBody,
} from "./validation";

describe("messaging validation", () => {
  it("accepts uuids and rejects garbage", () => {
    expect(isMessagingUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isMessagingUuid("not-a-uuid")).toBe(false);
  });

  it("normalises message bodies", () => {
    expect(normaliseMessageBody("  hello  ")).toBe("hello");
    expect(() => normaliseMessageBody("")).toThrow(/empty/i);
    expect(() => normaliseMessageBody("x".repeat(8001))).toThrow(/too long/i);
  });

  it("normalises group titles", () => {
    expect(normaliseGroupTitle(" Finance ")).toBe("Finance");
    expect(() => normaliseGroupTitle("")).toThrow();
  });

  it("orders by seq", () => {
    expect(compareMessageSeq({ seq: 2 }, { seq: 5 })).toBeLessThan(0);
  });

  it("escapes html-sensitive text", () => {
    expect(escapeMessagingText(`<script>alert("x")</script>`)).toContain("&lt;script&gt;");
  });

  it("allow-lists attachment mime types", () => {
    expect(isAllowedMessagingMime("application/pdf")).toBe(true);
    expect(isAllowedMessagingMime("application/x-msdownload")).toBe(false);
  });
});
