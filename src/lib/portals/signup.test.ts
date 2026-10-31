import { describe, expect, it } from "vitest";
import { resolvePortalSignup } from "./signup";

describe("resolvePortalSignup", () => {
  it("enters the portal when signup returns a session", () => {
    expect(resolvePortalSignup({ hasSession: true, identityCount: 1 })).toEqual({
      kind: "session",
    });
  });

  it("asks a new user to confirm their email", () => {
    expect(resolvePortalSignup({ hasSession: false, identityCount: 1 })).toEqual({
      kind: "confirm",
    });
  });

  it("treats an empty identity list as an existing account", () => {
    expect(resolvePortalSignup({ hasSession: false, identityCount: 0 })).toEqual({
      kind: "existing",
    });
  });

  it("treats the already-registered error as an existing account", () => {
    expect(
      resolvePortalSignup({
        errorMessage: "User already registered",
        hasSession: false,
        identityCount: null,
      }),
    ).toEqual({ kind: "existing" });
  });

  it("surfaces other provider errors", () => {
    expect(
      resolvePortalSignup({
        errorMessage: "Password should be at least 8 characters",
        hasSession: false,
        identityCount: null,
      }),
    ).toEqual({ kind: "error", message: "Password should be at least 8 characters" });
  });
});
