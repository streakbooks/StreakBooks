/**
 * Abuse / security alert drafts for marketplace monitoring.
 * Does not insert rows — callers persist via authorized RPCs when available.
 * FAIL CLOSED: never embeds raw tokens or service-role material.
 */

import { containsRawTokenMaterial } from "@/lib/app-store/security/token-compromise";
import { scoreSuspiciousActivity } from "@/lib/app-store/security/rate-limit";

export type MarketplaceAlertType =
  | "rate_limit"
  | "cross_tenant"
  | "permission_denied"
  | "token_compromise"
  | "webhook_invalid"
  | "bot_challenge"
  | "security_review"
  | "oauth_mismatch";

export type MarketplaceAlertDraft = {
  companyId: string | null;
  alertType: MarketplaceAlertType;
  severity: "low" | "medium" | "high" | "critical";
  summary: string;
  details: Record<string, string | number | boolean | null>;
};

export function buildMarketplaceAbuseAlert(input: {
  companyId?: string | null;
  alertType: MarketplaceAlertType;
  summary: string;
  details?: Record<string, unknown>;
  signals?: {
    failedAuthCount?: number;
    crossTenantAttempts?: number;
    rateLimitHits?: number;
    invalidWebhookCount?: number;
  };
}): MarketplaceAlertDraft {
  const scored = scoreSuspiciousActivity({
    failedAuthCount: input.signals?.failedAuthCount ?? 0,
    crossTenantAttempts: input.signals?.crossTenantAttempts ?? 0,
    rateLimitHits: input.signals?.rateLimitHits ?? 0,
    invalidWebhookCount: input.signals?.invalidWebhookCount ?? 0,
  });

  // Cross-tenant and token compromise are always at least high.
  const severity =
    input.alertType === "cross_tenant" || input.alertType === "token_compromise"
      ? scored.severity === "critical"
        ? "critical"
        : "high"
      : scored.severity;

  const safeDetails: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(input.details ?? {})) {
    if (value === null || typeof value === "boolean" || typeof value === "number") {
      safeDetails[key] = value;
      continue;
    }
    const asString = String(value);
    if (containsRawTokenMaterial(asString)) {
      safeDetails[key] = "[redacted]";
      continue;
    }
    safeDetails[key] = asString.slice(0, 500);
  }

  let summary = input.summary.trim().slice(0, 500);
  if (containsRawTokenMaterial(summary)) {
    summary = "Security alert (details redacted — token material detected).";
  }

  return {
    companyId: input.companyId ?? null,
    alertType: input.alertType,
    severity,
    summary,
    details: { ...safeDetails, abuseScore: scored.score },
  };
}
