import { describe, expect, it, beforeEach } from "vitest";
import {
  __resetMarketplaceHttpTestState,
  handleMarketplaceApiV1,
  marketplaceVaultConfigured,
  toMarketplaceCataloguePath,
} from "@/lib/app-store/api/v1/http.server";
import { assertPublicApiProductionReady } from "@/lib/app-store/api/v1/router";
import { buildMarketplaceAbuseAlert } from "@/lib/app-store/security/abuse-alert";
import {
  assertSameCompany,
  CrossTenantAccessError,
  detectDangerousScopeEscalation,
  filterToCompany,
} from "@/lib/app-store/security/tenant-isolation";
import { decideEnqueueSyncJob } from "@/lib/app-store/engine/enqueue";
import { roleHasPermission } from "@/lib/permissions";
import {
  containsRawTokenMaterial,
  respondToTokenCompromise,
} from "@/lib/app-store/security/token-compromise";
import { createEphemeralMemoryTokenVault } from "@/lib/app-store/engine/oauth-token";

describe("marketplace HTTP fail-closed", () => {
  beforeEach(() => {
    __resetMarketplaceHttpTestState();
  });

  it("maps marketplace paths to catalogue paths", () => {
    expect(toMarketplaceCataloguePath("/api/marketplace/v1")).toBe("/api/v1");
    expect(toMarketplaceCataloguePath("/api/marketplace/v1/contacts")).toBe("/api/v1/contacts");
  });

  it("exposes route catalogue without unlocking data", async () => {
    const res = await handleMarketplaceApiV1(
      new Request("http://localhost/api/marketplace/v1/routes"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("locks unauthorized data routes with security_locked", async () => {
    const res = await handleMarketplaceApiV1(
      new Request("http://localhost/api/marketplace/v1/contacts", {
        headers: { "x-marketplace-fingerprint": "sec-test-1" },
      }),
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as { ok: false; error: { code: string } };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("security_locked");
  });

  it("returns 404 for unknown marketplace routes", async () => {
    const res = await handleMarketplaceApiV1(
      new Request("http://localhost/api/marketplace/v1/not-a-route", {
        headers: { "x-marketplace-fingerprint": "sec-test-2" },
      }),
    );
    expect(res.status).toBe(404);
  });

  it("rate-limits burst traffic on data paths", async () => {
    const headers = { "x-marketplace-fingerprint": "burst-client" };
    let limited = false;
    for (let i = 0; i < 70; i += 1) {
      const res = await handleMarketplaceApiV1(
        new Request("http://localhost/api/marketplace/v1/contacts", { headers }),
      );
      if (res.status === 429) {
        limited = true;
        break;
      }
    }
    expect(limited).toBe(true);
  });

  it("rejects invalid bot challenge headers", async () => {
    const res = await handleMarketplaceApiV1(
      new Request("http://localhost/api/marketplace/v1/contacts", {
        headers: {
          "x-marketplace-fingerprint": "bot-test",
          "x-marketplace-challenge-id": "missing-challenge",
        },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("keeps vault unset by default", () => {
    expect(marketplaceVaultConfigured({})).toBe(false);
    expect(
      assertPublicApiProductionReady({
        oauthVaultConfigured: false,
        securityReviewPassed: true,
        consentActive: true,
        tokenRevoked: false,
      }).ok,
    ).toBe(false);
  });
});

describe("tenant isolation and permission bypass", () => {
  it("filters rows to the active company only", () => {
    const rows = filterToCompany(
      [
        { companyId: "a", id: "1" },
        { companyId: "b", id: "2" },
        { companyId: "a", id: "3" },
      ],
      "a",
    );
    expect(rows.map((r) => r.id)).toEqual(["1", "3"]);
  });

  it("denies cross-tenant assertSameCompany", () => {
    expect(() => assertSameCompany("company-a", "company-b")).toThrow(CrossTenantAccessError);
  });

  it("detects scope escalation", () => {
    expect(
      detectDangerousScopeEscalation(["contacts.read", "files.write"], ["contacts.read"]),
    ).toEqual(["files.write"]);
  });

  it("blocks staff from install and certification privileges", () => {
    expect(roleHasPermission("staff", "appstore.install")).toBe(false);
    expect(roleHasPermission("staff", "appstore.manage_certification")).toBe(false);
    expect(roleHasPermission("read_only", "appstore.resolve_exceptions")).toBe(false);
  });
});

describe("token compromise and enqueue gates", () => {
  it("revokes on compromise when rotate fails closed", async () => {
    const vault = createEphemeralMemoryTokenVault();
    const stored = await vault.store({
      companyId: "c1",
      connectionId: "conn-1",
      tokens: {
        accessToken: "access",
        refreshToken: "refresh",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        scopes: ["contacts.read"],
        tokenType: "Bearer",
      },
    });
    // Force revoke path by preferring rotate against expired token.
    const expired = {
      ...stored,
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    };
    const result = await respondToTokenCompromise(vault, expired, { preferRotate: true });
    expect(result.action).toBe("revoke");
  });

  it("redacts raw token material in abuse alerts", () => {
    expect(containsRawTokenMaterial('{"access_token":"abc"}')).toBe(true);
    const alert = buildMarketplaceAbuseAlert({
      alertType: "token_compromise",
      summary: "leak Bearer abc.def.ghi",
      details: { sample: '{"access_token":"secret"}' },
      signals: { failedAuthCount: 2, crossTenantAttempts: 1 },
    });
    expect(alert.details["sample"]).toBe("[redacted]");
    expect(alert.severity === "high" || alert.severity === "critical").toBe(true);
  });

  it("blocks sync enqueue without E2E verification", () => {
    const decision = decideEnqueueSyncJob({
      companyId: "00000000-0000-4000-8000-000000000001",
      appCode: "shopify",
      connectionId: null,
      trigger: "manual",
      implementationStatus: "adapter_scaffolded",
      securityReviewPassed: true,
      realCustomerDataEnabled: false,
      suspended: false,
      hasInstallPermission: true,
      oauthVaultConfigured: true,
    });
    expect(decision.allowed).toBe(false);
  });
});
