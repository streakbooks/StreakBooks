import { describe, expect, it } from "vitest";
import { buildIdempotencyKey, decideIdempotency } from "@/lib/app-store/engine/idempotency";
import { canRetrySyncJob, nextRetryDelayMs } from "@/lib/app-store/engine/job-queue";
import {
  assertWebhookNotReplayed,
  assertWebhookTimestampFresh,
  timingSafeEqualHex,
  verifyWebhookSignature,
} from "@/lib/app-store/engine/webhook-security";
import { assertRedirectUriAllowed, isTokenExpired } from "@/lib/app-store/engine/oauth-token";
import { requireScope, notImplemented } from "@/lib/app-store/api/v1/router";
import {
  buildIntegrationRegister,
  isGenuinelyInstallable,
} from "@/lib/app-store/integration-register";
import { connectorInstallActionLabel } from "@/lib/app-store/connector-status";

describe("integration engine foundations", () => {
  it("builds stable idempotency keys and skips duplicates", () => {
    const key = buildIdempotencyKey({
      companyId: "c1",
      connectionId: "conn1",
      domain: "invoice",
      externalId: "ord-9",
    });
    expect(key).toContain("ord-9");
    expect(decideIdempotency({ seenKeys: new Set([key]), key, alreadyPosted: false }).action).toBe(
      "skip",
    );
    expect(decideIdempotency({ seenKeys: new Set(), key, alreadyPosted: true }).reason).toBe(
      "already_posted",
    );
  });

  it("verifies webhook freshness, replay and signatures", () => {
    const now = Date.now();
    expect(assertWebhookTimestampFresh(Math.floor(now / 1000), now).ok).toBe(true);
    expect(assertWebhookTimestampFresh(Math.floor(now / 1000) - 10_000, now).ok).toBe(false);
    const replayed = assertWebhookNotReplayed("evt_1", new Set(["evt_1"]));
    expect(replayed.ok).toBe(false);
    if (!replayed.ok) expect(replayed.reason).toBe("replay");
    expect(timingSafeEqualHex("abcd", "abcd")).toBe(true);
    expect(verifyWebhookSignature({ providedSignature: null, expectedSignature: "aa" }).ok).toBe(
      false,
    );
  });

  it("gates retries and redirect URIs", () => {
    expect(canRetrySyncJob({ status: "failed", retryCount: 1 })).toBe(true);
    expect(canRetrySyncJob({ status: "succeeded", retryCount: 0 })).toBe(false);
    expect(nextRetryDelayMs(0, 1000, 10_000)).toBeGreaterThanOrEqual(1000);
    expect(
      assertRedirectUriAllowed("https://partner.example/cb", ["https://partner.example/cb"]),
    ).toBe(true);
    expect(assertRedirectUriAllowed("http://evil.example/cb", ["https://partner.example/cb"])).toBe(
      false,
    );
    expect(isTokenExpired(new Date(Date.now() - 1000).toISOString())).toBe(true);
  });

  it("enforces public API scopes and not-implemented responses", () => {
    expect(requireScope(["contacts.read"], "contacts.write").ok).toBe(false);
    expect(requireScope(["contacts.write"], "contacts.write").ok).toBe(true);
    expect(notImplemented("POST /api/v1/contacts").ok).toBe(false);
  });

  it("never marks catalogue connectors as installable", () => {
    const register = buildIntegrationRegister();
    const liveConnectors = register.filter((e) => e.kind !== "csv_fallback");
    expect(liveConnectors.every((e) => !isGenuinelyInstallable(e))).toBe(true);
    expect(connectorInstallActionLabel("sandbox_partial")).toBe("request");
    expect(connectorInstallActionLabel("e2e_verified")).toBe("install");
  });
});
