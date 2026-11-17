import { describe, expect, it } from "vitest";
import { sanitiseMessagingHref, segmentMessagingBody } from "./linkify";

describe("messaging linkify", () => {
  it("only allows http(s) hrefs", () => {
    expect(sanitiseMessagingHref("https://example.com/a")).toContain("https://example.com/a");
    expect(sanitiseMessagingHref("javascript:alert(1)")).toBeNull();
  });

  it("segments urls and mentions without HTML", () => {
    const parts = segmentMessagingBody("Hi @Ada see https://example.com/docs please");
    expect(parts.some((p) => p.type === "mention" && p.value === "@Ada")).toBe(true);
    expect(parts.some((p) => p.type === "url" && p.href.startsWith("https://example.com"))).toBe(
      true,
    );
  });
});
