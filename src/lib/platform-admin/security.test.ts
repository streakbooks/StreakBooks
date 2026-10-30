import { describe, expect, it } from "vitest";
import {
  hasPlatformScope, isPlatformRole, requirePlatformMfa, validateReason,
} from "./security";

describe("platform administration role isolation", () => {
  it("does not confuse organisation roles with platform roles", () => {
    for (const role of ["owner", "admin", "accountant", "billing_operator", "", null, undefined]) {
      expect(isPlatformRole(role)).toBe(false);
    }
    expect(isPlatformRole("platform_owner")).toBe(true);
    expect(isPlatformRole("platform_finance")).toBe(true);
    expect(isPlatformRole("platform_support")).toBe(true);
  });

  it("uses deny-by-default access scopes", () => {
    expect(hasPlatformScope(null, "overview")).toBe(false);
    expect(hasPlatformScope("platform_support", "overview")).toBe(true);
    expect(hasPlatformScope("platform_support", "organisations")).toBe(true);
    expect(hasPlatformScope("platform_support", "billing")).toBe(false);
    expect(hasPlatformScope("platform_support", "audit")).toBe(false);
    expect(hasPlatformScope("platform_support", "manage")).toBe(false);
    expect(hasPlatformScope("platform_finance", "billing")).toBe(true);
    expect(hasPlatformScope("platform_finance", "manage")).toBe(false);
    expect(hasPlatformScope("platform_owner", "manage")).toBe(true);
    expect(hasPlatformScope("platform_owner", "audit")).toBe(true);
  });

  it("requires MFA step-up for administration", () => {
    expect(() => requirePlatformMfa({ aal: "aal2" })).not.toThrow();
    expect(() => requirePlatformMfa({ aal: "aal1" })).toThrow(/MFA/);
    expect(() => requirePlatformMfa({ aal: "" })).toThrow(/MFA/);
    expect(() => requirePlatformMfa(null)).toThrow(/MFA/);
  });

  it("enforces an audit explanation for mutations", () => {
    expect(() => validateReason("short")).toThrow(/12/);
    expect(() => validateReason("x".repeat(501))).toThrow(/500/);
    expect(validateReason("  Approved for billing review  ")).toBe("Approved for billing review");
  });
});
