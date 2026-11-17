import { describe, expect, it } from "vitest";
import { copiedQuoteExpiryDate } from "@/lib/sales/copy-quote";

describe("copiedQuoteExpiryDate", () => {
  it("preserves the day span from the original quote", () => {
    expect(copiedQuoteExpiryDate("2026-11-17", "2026-10-01", "2026-10-31")).toBe("2026-12-17");
  });

  it("returns null when expiry is missing or invalid", () => {
    expect(copiedQuoteExpiryDate("2026-11-17", "2026-10-01", null)).toBeNull();
    expect(copiedQuoteExpiryDate("2026-11-17", "2026-10-01", "2026-09-01")).toBeNull();
  });
});
