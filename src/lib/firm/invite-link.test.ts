import { describe, expect, it } from "vitest";
import { configuredInvitationOrigin, firmInvitePath } from "./invite-link";

describe("firm invitation link safety", () => {
  it("accepts only configured HTTPS origins or local development", () => {
    expect(configuredInvitationOrigin("https://books.example.com/")).toBe(
      "https://books.example.com",
    );
    expect(configuredInvitationOrigin("http://localhost:8080")).toBe("http://localhost:8080");
    expect(configuredInvitationOrigin("http://books.example.com")).toBeNull();
    expect(configuredInvitationOrigin("https://books.example.com/evil")).toBeNull();
    expect(configuredInvitationOrigin("https://user:password@books.example.com")).toBeNull();
    expect(configuredInvitationOrigin("https://books.example.com?x=1")).toBeNull();
  });
  it("enforces single-use token format before constructing an invite path", () => {
    const token = "a".repeat(64);
    expect(firmInvitePath(token)).toBe("/firm-invite/" + token);
    expect(() => firmInvitePath("../admin")).toThrow("Invalid invitation token");
  });
});
