import { describe, expect, it } from "vitest";
import {
  createPkceChallenge,
  createOAuthState,
  markOAuthStateUsed,
  validateOAuthCallbackState,
} from "@/lib/app-store/engine/oauth-pkce";
import {
  createEphemeralMemoryTokenVault,
  createUnconfiguredTokenVault,
} from "@/lib/app-store/engine/oauth-token";
import { assertRedirectUriAllowed } from "@/lib/app-store/engine/oauth-token";
import {
  evaluateSecurityReview,
  SECURITY_REVIEW_CHECKLIST,
} from "@/lib/app-store/security/approval";
import { decideConsentGrant } from "@/lib/app-store/security/consent";
import {
  containsRawTokenMaterial,
  respondToTokenCompromise,
} from "@/lib/app-store/security/token-compromise";
import {
  buildIntegrationRegister,
  isGenuinelyInstallable,
} from "@/lib/app-store/integration-register";
import {
  assertSameCompany,
  CrossTenantAccessError,
} from "@/lib/app-store/security/tenant-isolation";
import { requireScope } from "@/lib/app-store/api/v1/router";

describe("OAuth PKCE and state validation", () => {
  it("creates S256 challenges and rejects replayed or cross-company states", async () => {
    const pkce = await createPkceChallenge();
    expect(pkce.codeChallengeMethod).toBe("S256");
    expect(pkce.codeChallenge).not.toBe(pkce.codeVerifier);

    const state = createOAuthState({
      companyId: "company-a",
      appCode: "shopify",
      redirectUri: "https://streakbooks.com/oauth/callback",
      codeChallenge: pkce.codeChallenge,
      nowMs: 1_000,
      ttlMs: 60_000,
    });

    const ok = validateOAuthCallbackState({
      stored: state,
      presentedState: state.state,
      companyId: "company-a",
      appCode: "shopify",
      redirectUri: "https://streakbooks.com/oauth/callback",
      nowMs: 2_000,
    });
    expect(ok.ok).toBe(true);

    const cross = validateOAuthCallbackState({
      stored: state,
      presentedState: state.state,
      companyId: "company-b",
      appCode: "shopify",
      redirectUri: "https://streakbooks.com/oauth/callback",
      nowMs: 2_000,
    });
    expect(cross.ok).toBe(false);
    if (!cross.ok) expect(cross.reason).toBe("company_mismatch");

    const used = markOAuthStateUsed(state);
    const replay = validateOAuthCallbackState({
      stored: used,
      presentedState: state.state,
      companyId: "company-a",
      appCode: "shopify",
      redirectUri: "https://streakbooks.com/oauth/callback",
      nowMs: 2_000,
    });
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.reason).toBe("replay");
  });

  it("rejects non-https redirect URIs outside localhost", () => {
    expect(assertRedirectUriAllowed("https://ok.example/cb", ["https://ok.example/cb"])).toBe(true);
    expect(assertRedirectUriAllowed("http://evil.example/cb", ["http://evil.example/cb"])).toBe(
      false,
    );
  });
});

describe("token compromise and vault fail-closed", () => {
  it("keeps production vault unconfigured", async () => {
    const vault = createUnconfiguredTokenVault();
    await expect(
      vault.store({
        companyId: "c1",
        connectionId: "x",
        tokens: {
          accessToken: "a",
          refreshToken: "r",
          expiresAt: null,
          scopes: [],
          tokenType: "Bearer",
        },
      }),
    ).rejects.toThrow(/not configured/i);
  });

  it("rotates then can revoke compromised memory credentials", async () => {
    const vault = createEphemeralMemoryTokenVault();
    const stored = await vault.store({
      companyId: "company-a",
      connectionId: "conn-1",
      tokens: {
        accessToken: "access",
        refreshToken: "refresh",
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        scopes: ["sales.read"],
        tokenType: "Bearer",
      },
    });
    const rotated = await respondToTokenCompromise(vault, stored, { preferRotate: true });
    expect(rotated.action).toBe("rotate");
    expect(rotated.credentialRef).not.toBe(stored.credentialRef);

    const revoked = await respondToTokenCompromise(
      vault,
      { ...stored, credentialRef: rotated.credentialRef, revokedAt: null },
      { preferRotate: false },
    );
    expect(revoked.action).toBe("revoke");
  });

  it("detects raw token leakage patterns", () => {
    expect(containsRawTokenMaterial('{"access_token":"x"}')).toBe(true);
    expect(containsRawTokenMaterial("Bearer abc.def.ghi")).toBe(true);
    expect(containsRawTokenMaterial('{"app_code":"shopify"}')).toBe(false);
  });
});

describe("security approval and consent", () => {
  it("blocks publish and real-data until checklist and admin approval", () => {
    const incomplete = evaluateSecurityReview({
      checklist: {},
      adminApproved: false,
      e2eVerified: false,
      suspended: false,
    });
    expect(incomplete.canPublish).toBe(false);
    expect(incomplete.missingChecklist.length).toBe(SECURITY_REVIEW_CHECKLIST.length);

    const checklist = Object.fromEntries(
      SECURITY_REVIEW_CHECKLIST.map((item) => [item.key, true]),
    ) as Record<(typeof SECURITY_REVIEW_CHECKLIST)[number]["key"], boolean>;

    const approvedNoE2e = evaluateSecurityReview({
      checklist,
      adminApproved: true,
      e2eVerified: false,
      suspended: false,
    });
    expect(approvedNoE2e.canPublish).toBe(true);
    expect(approvedNoE2e.canEnableRealCustomerData).toBe(false);

    const full = evaluateSecurityReview({
      checklist,
      adminApproved: true,
      e2eVerified: true,
      suspended: false,
    });
    expect(full.canEnableRealCustomerData).toBe(true);
  });

  it("rejects consent scope escalation", () => {
    const denied = decideConsentGrant({
      companyId: "company-a",
      appCode: "hubdoc",
      connectionId: null,
      requestedScopes: ["sales.read", "service_role"],
      allowedScopes: ["sales.read", "files.write"],
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.reason).toBe("scope_escalation");

    const ok = decideConsentGrant({
      companyId: "company-a",
      appCode: "hubdoc",
      connectionId: null,
      requestedScopes: ["sales.read"],
      allowedScopes: ["sales.read", "files.write"],
    });
    expect(ok.ok).toBe(true);
  });
});

describe("permission bypass and register gates", () => {
  it("denies missing API scopes and cross-tenant asserts", () => {
    const forbidden = requireScope(["sales.read"], "sales.write");
    expect(forbidden.ok).toBe(false);
    expect(() => assertSameCompany("a", "b")).toThrow(CrossTenantAccessError);
  });

  it("keeps register entries non-installable without security + real-data gates", () => {
    const entries = buildIntegrationRegister();
    expect(entries.every((e) => e.realCustomerDataEnabled === false)).toBe(true);
    expect(
      entries.filter((e) => e.kind !== "csv_fallback").every((e) => !e.securityReviewPassed),
    ).toBe(true);
    expect(entries.every((e) => !isGenuinelyInstallable(e))).toBe(true);
  });
});
