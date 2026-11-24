import { describe, expect, it } from "vitest";
import { createOAuthState, validateOAuthCallbackState } from "@/lib/app-store/engine/oauth-pkce";
import {
  deriveCatalogueFingerprint,
  issueBotChallenge,
  validateBotChallenge,
} from "@/lib/app-store/security/bot-challenge";
import { evaluateActivation } from "@/lib/app-store/security/activation";

describe("bot challenge and catalogue fingerprint", () => {
  it("rejects honeypot, timing and expired challenges", () => {
    const challenge = issueBotChallenge({ nowMs: 10_000, ttlMs: 60_000 });
    expect(
      validateBotChallenge({
        challenge,
        presentedChallengeId: challenge.challengeId,
        honeypotValue: "http://spam.example",
        nowMs: 11_000,
      }).ok,
    ).toBe(false);

    expect(
      validateBotChallenge({
        challenge,
        presentedChallengeId: challenge.challengeId,
        honeypotValue: "",
        nowMs: 10_100,
        minSolveMs: 400,
      }).ok,
    ).toBe(false);

    expect(
      validateBotChallenge({
        challenge,
        presentedChallengeId: challenge.challengeId,
        honeypotValue: "",
        nowMs: 80_000,
      }).ok,
    ).toBe(false);

    expect(
      validateBotChallenge({
        challenge,
        presentedChallengeId: challenge.challengeId,
        honeypotValue: "",
        nowMs: 11_000,
        minSolveMs: 400,
      }).ok,
    ).toBe(true);
  });

  it("derives stable-ish catalogue fingerprints", () => {
    const a = deriveCatalogueFingerprint({
      userAgent: "Mozilla/5.0",
      acceptLanguage: "en-GB",
      sessionHint: "s1",
    });
    const b = deriveCatalogueFingerprint({
      userAgent: "Mozilla/5.0",
      acceptLanguage: "en-GB",
      sessionHint: "s1",
    });
    const c = deriveCatalogueFingerprint({
      userAgent: "Other",
      acceptLanguage: "en-GB",
      sessionHint: "s1",
    });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a.length).toBeGreaterThanOrEqual(8);
  });
});

describe("oauth state company isolation", () => {
  it("fails closed across companies for the same presented state", () => {
    const state = createOAuthState({
      companyId: "company-a",
      appCode: "stripe_payments",
      redirectUri: "https://streakbooks.com/oauth/callback",
      codeChallenge: "x".repeat(43),
      nowMs: 1_000,
    });
    const denied = validateOAuthCallbackState({
      stored: state,
      presentedState: state.state,
      companyId: "company-b",
      appCode: "stripe_payments",
      redirectUri: "https://streakbooks.com/oauth/callback",
      nowMs: 2_000,
    });
    expect(denied.ok).toBe(false);
  });
});

describe("oauth begin remains fail-closed without gates", () => {
  it("denies activation without real-data enablement", () => {
    expect(
      evaluateActivation({
        implementationStatus: "e2e_verified",
        securityReviewPassed: true,
        realCustomerDataEnabled: false,
        suspended: false,
        hasInstallPermission: true,
      }).allowed,
    ).toBe(false);
  });
});
