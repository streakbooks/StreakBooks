import { describe, expect, it } from "vitest";
import {
  buildAuthProviders,
  buildCaptchaConfig,
  buildEmailOtpLength,
  normalisePhone,
  parseOAuthProviders,
  safeRedirect,
  ssoDomainFrom,
  validateOtp,
  validatePhone,
} from "@/lib/auth-helpers";

const enabledIds = (env: Record<string, string>) =>
  buildAuthProviders(env)
    .filter((p) => p.enabled)
    .map((p) => p.id);

describe("auth provider registry", () => {
  it("defaults to password and email code only", () => {
    expect(enabledIds({})).toEqual(["password", "email_code"]);
  });

  it("enables only recognised OAuth providers, once each", () => {
    expect(parseOAuthProviders(" Google,azure,unknown,google ")).toEqual(["google", "azure"]);
    expect(enabledIds({ VITE_AUTH_OAUTH_PROVIDERS: "github" })).toContain("github");
  });

  it("reads boolean flags for phone, SSO and email code", () => {
    const ids = enabledIds({
      VITE_AUTH_PHONE_ENABLED: "true",
      VITE_AUTH_SSO_ENABLED: "1",
      VITE_AUTH_EMAIL_CODE_ENABLED: "false",
    });
    expect(ids).toEqual(["password", "phone", "sso"]);
  });
});

describe("email sign-in code length", () => {
  it("defaults to link-only and accepts 6–10 digit codes", () => {
    expect(buildEmailOtpLength({})).toBe(0);
    expect(buildEmailOtpLength({ VITE_AUTH_EMAIL_OTP_LENGTH: "6" })).toBe(6);
    expect(buildEmailOtpLength({ VITE_AUTH_EMAIL_OTP_LENGTH: "4" })).toBe(0);
    expect(buildEmailOtpLength({ VITE_AUTH_EMAIL_OTP_LENGTH: "abc" })).toBe(0);
  });
});

describe("captcha config", () => {
  it("requires a supported provider and a site key", () => {
    expect(buildCaptchaConfig({})).toBeNull();
    expect(
      buildCaptchaConfig({ VITE_CAPTCHA_PROVIDER: "recaptcha", VITE_CAPTCHA_SITE_KEY: "k" }),
    ).toBeNull();
    expect(buildCaptchaConfig({ VITE_CAPTCHA_PROVIDER: "turnstile" })).toBeNull();
    expect(
      buildCaptchaConfig({ VITE_CAPTCHA_PROVIDER: "Turnstile", VITE_CAPTCHA_SITE_KEY: " key " }),
    ).toEqual({ provider: "turnstile", siteKey: "key" });
  });
});

describe("auth input validation", () => {
  it("accepts E.164 phone numbers only", () => {
    expect(normalisePhone("+44 (7700) 900-123")).toBe("+447700900123");
    expect(validatePhone("+44 7700 900123")).toBeNull();
    expect(validatePhone("07700900123")).not.toBeNull();
    expect(validatePhone("")).not.toBeNull();
  });

  it("validates 6-digit codes", () => {
    expect(validateOtp("123456")).toBeNull();
    expect(validateOtp("12345")).not.toBeNull();
    expect(validateOtp("12a456")).not.toBeNull();
  });

  it("extracts an SSO domain from an email or domain", () => {
    expect(ssoDomainFrom("Alex@Acme.co.uk")).toBe("acme.co.uk");
    expect(ssoDomainFrom("acme.com")).toBe("acme.com");
    expect(ssoDomainFrom("not a domain")).toBeNull();
    expect(ssoDomainFrom("you@")).toBeNull();
  });

  it("only allows same-origin redirects", () => {
    expect(safeRedirect("/sales")).toBe("/sales");
    expect(safeRedirect("//evil.com")).toBe("/");
    expect(safeRedirect("https://evil.com")).toBe("/");
  });
});
