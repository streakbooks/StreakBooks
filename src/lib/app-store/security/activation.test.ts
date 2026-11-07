import { describe, expect, it } from "vitest";
import {
  assertRealDataAccessAllowed,
  canActivateMarketplaceApp,
  evaluateActivation,
} from "@/lib/app-store/security/activation";
import {
  assertSameCompany,
  CrossTenantAccessError,
  detectDangerousScopeEscalation,
  filterToCompany,
} from "@/lib/app-store/security/tenant-isolation";
import {
  assertNoServiceRoleEnvLeak,
  sanitizeAuditDetails,
} from "@/lib/app-store/security/client-guards";
import { evaluateRateLimit, scoreSuspiciousActivity } from "@/lib/app-store/security/rate-limit";
import { validateWebhookEnvelope } from "@/lib/app-store/security/webhook-payload";
import {
  assertPublicApiProductionReady,
  checkPublicApiRateLimit,
  rejectScopeEscalation,
} from "@/lib/app-store/api/v1/router";
import { isInstallableNativeConnector } from "@/lib/app-store/adapters/registry";
import { shopifyAdapter } from "@/lib/app-store/adapters/shopify";
import { DEFAULT_MARKETPLACE_APPS } from "@/lib/app-store/catalogue";

describe("marketplace fail-closed activation", () => {
  it("denies real-data activation unless every gate passes", () => {
    const denied = evaluateActivation({
      implementationStatus: "e2e_verified",
      securityReviewPassed: true,
      realCustomerDataEnabled: false,
      suspended: false,
      hasInstallPermission: true,
    });
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toMatch(/fail closed/i);

    const allowed = evaluateActivation({
      implementationStatus: "e2e_verified",
      securityReviewPassed: true,
      realCustomerDataEnabled: true,
      suspended: false,
      hasInstallPermission: true,
    });
    expect(allowed.allowed).toBe(true);
  });

  it("throws on assert when gates fail", () => {
    expect(() =>
      assertRealDataAccessAllowed({
        implementationStatus: "adapter_scaffolded",
        securityReviewPassed: false,
        realCustomerDataEnabled: false,
        suspended: false,
        hasInstallPermission: true,
      }),
    ).toThrow(/FAIL CLOSED/);
  });

  it("keeps native scaffolds non-installable", () => {
    expect(isInstallableNativeConnector("shopify")).toBe(false);
    expect(isInstallableNativeConnector("amazon_seller")).toBe(false);
    expect(isInstallableNativeConnector("stripe_payments")).toBe(false);
  });

  it("keeps every catalogue seed fail-closed for real customer data", () => {
    for (const app of DEFAULT_MARKETPLACE_APPS) {
      expect(app.realCustomerDataEnabled).toBe(false);
      expect(app.securityReviewPassed).toBe(false);
      expect(canActivateMarketplaceApp(app, true)).toBe(false);
    }
  });

  it("blocks Shopify authorization until gates pass", async () => {
    await expect(
      shopifyAdapter.beginAuthorization({
        companyId: "00000000-0000-0000-0000-000000000001",
        redirectUri: "https://linkbooks.app/oauth/callback",
      }),
    ).rejects.toThrow(/FAIL CLOSED/);
  });
});

describe("two-company isolation helpers", () => {
  it("blocks cross-company resource access", () => {
    expect(() => assertSameCompany("company-a", "company-b", "connection")).toThrow(
      CrossTenantAccessError,
    );
    expect(() => assertSameCompany("company-a", "company-a")).not.toThrow();
    expect(
      filterToCompany(
        [
          { companyId: "a", id: "1" },
          { companyId: "b", id: "2" },
        ],
        "a",
      ),
    ).toEqual([{ companyId: "a", id: "1" }]);
  });

  it("detects OAuth scope escalation", () => {
    expect(
      detectDangerousScopeEscalation(
        ["contacts.read", "sales.write", "service_role"],
        ["contacts.read", "sales.write"],
      ),
    ).toEqual(["service_role"]);
  });
});

describe("client security guards", () => {
  it("flags vite-exposed service role env names", () => {
    expect(
      assertNoServiceRoleEnvLeak({
        VITE_SUPABASE_SERVICE_ROLE_KEY: "x",
        SUPABASE_URL: "https://example.supabase.co",
      }).ok,
    ).toBe(false);
    expect(assertNoServiceRoleEnvLeak({ SUPABASE_URL: "https://example.supabase.co" }).ok).toBe(
      true,
    );
  });

  it("strips secrets from audit payloads", () => {
    expect(
      sanitizeAuditDetails({
        app_code: "shopify",
        accessToken: "secret",
        refresh_token: "secret",
        status: "requested",
      }),
    ).toEqual({ app_code: "shopify", status: "requested" });
  });
});

describe("rate limit and abuse detection", () => {
  it("enforces in-process rate limits", () => {
    const first = evaluateRateLimit({
      nowMs: 1_000,
      windowMs: 60_000,
      max: 2,
      priorTimestamps: [],
    });
    expect(first.allowed).toBe(true);
    const second = evaluateRateLimit({
      nowMs: 1_100,
      windowMs: 60_000,
      max: 2,
      priorTimestamps: first.nextTimestamps,
    });
    expect(second.allowed).toBe(true);
    const third = evaluateRateLimit({
      nowMs: 1_200,
      windowMs: 60_000,
      max: 2,
      priorTimestamps: second.nextTimestamps,
    });
    expect(third.allowed).toBe(false);
  });

  it("scores suspicious activity", () => {
    expect(
      scoreSuspiciousActivity({
        failedAuthCount: 1,
        crossTenantAttempts: 2,
        rateLimitHits: 0,
        invalidWebhookCount: 0,
      }).severity,
    ).toBe("high");
  });
});

describe("webhook payload validation", () => {
  it("rejects cross-company webhook envelopes", () => {
    expect(
      validateWebhookEnvelope({
        rawBody: JSON.stringify({ ok: true }),
        eventId: "evt_1",
        eventType: "order.created",
        companyId: "company-b",
        expectedCompanyId: "company-a",
      }).ok,
    ).toBe(false);
  });

  it("accepts well-formed company-scoped envelopes", () => {
    const result = validateWebhookEnvelope({
      rawBody: JSON.stringify({ ok: true }),
      eventId: "evt_1",
      eventType: "order.created",
      companyId: "company-a",
      expectedCompanyId: "company-a",
    });
    expect(result).toEqual({ ok: true, eventId: "evt_1", eventType: "order.created" });
  });
});

describe("public API security locks", () => {
  it("fails closed when vault or consent is missing", () => {
    const locked = assertPublicApiProductionReady({
      oauthVaultConfigured: false,
      securityReviewPassed: true,
      consentActive: true,
      tokenRevoked: false,
    });
    expect(locked.ok).toBe(false);
    if (!locked.ok) expect(locked.error.code).toBe("security_locked");
  });

  it("rejects scope escalation and rate limit breaches", () => {
    const escalated = rejectScopeEscalation(["sales.read", "admin"], ["sales.read"]);
    expect(escalated.ok).toBe(false);
    const limited = checkPublicApiRateLimit({
      nowMs: 5_000,
      priorTimestamps: Array.from({ length: 60 }, (_, i) => i),
      max: 60,
      windowMs: 60_000,
    });
    expect(limited.ok).toBe(false);
  });
});
