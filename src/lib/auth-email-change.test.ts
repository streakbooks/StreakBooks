import { describe, expect, it } from "vitest";
import { normalizeEmailChangeAddress } from "./auth-email-change";

describe("email change address validation", () => {
  it("trims a valid address without changing the user's local part", () => {
    expect(normalizeEmailChangeAddress("  Gulshan+books@example.com  ")).toBe(
      "Gulshan+books@example.com",
    );
  });

  it.each(["", "no-at-sign", "name@", "name@example", "name with space@example.com"])(
    "rejects invalid address %s",
    (email) => {
      expect(normalizeEmailChangeAddress(email)).toBeNull();
    },
  );

  it("rejects addresses longer than the auth service limit", () => {
    const email = `${"a".repeat(245)}@example.com`;
    expect(normalizeEmailChangeAddress(email)).toBeNull();
  });
});
