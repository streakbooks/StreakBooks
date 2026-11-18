/**
 * Semantic domain status API (Section 20.1 §4).
 * Unknown statuses stay neutral/unmapped — never auto-promoted to paid/approved/success.
 */

import {
  humanizeStatus,
  statusDisplay,
  type StatusDisplay,
  type StatusTone,
} from "@/lib/status-badge";

export type DomainStatusDefinition = {
  key: string;
  label: string;
  tone: StatusTone;
  muted?: boolean;
  /** Optional domain that owns this status (sales, banking, expenses, …). */
  domain?: string;
};

const EXTRA = new Map<string, DomainStatusDefinition>();
const UNMAPPED_SEEN = new Set<string>();

/** Keys already defined in `src/lib/status-badge.ts` MAP, plus Section 3 additions. */
const CORE_KEYS = new Set([
  "draft",
  "submitted",
  "awaiting_approval",
  "pending",
  "authorised",
  "awaiting_payment",
  "approved",
  "partly_paid",
  "paid",
  "overdue",
  "void",
  "voided",
  "sent",
  "accepted",
  "declined",
  "expired",
  "converted",
  "uncategorised",
  "matched",
  "excluded",
  "reconciled",
  "unreconciled",
  "posted",
  "partially_paid",
  "partially_reconciled",
  "in_progress",
  "processing",
  "calculated",
  "reviewed",
  "payment_initiated",
  "partially_settled",
  "issued",
  "verified",
  "unverified",
  "disposed",
  "not_acquired",
  "terminated",
  "due",
  "awaiting_signature",
  "awaiting_client",
  "open",
  "resolved",
  "delivered",
  "confirmed",
  "partially_completed",
  "validated",
  "invalid",
  "applied",
  "pending_review",
  "completed",
  "complete",
  "settled",
  "failed",
  "error",
  "cancelled",
  "canceled",
  "inactive",
  "not_started",
  "awaiting_review",
  "awaiting_reimbursement",
  "reimbursed",
  "partially_approved",
  "reversed",
  "rejected",
  "active",
  "paused",
  "connected",
  "disconnected",
  "healthy",
  "degraded",
  "unhealthy",
  "unknown",
  "archived",
  "locked",
  "scheduled",
  "synced",
  "needs_attention",
]);

function normalizeKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

/** Register an additional domain status at module init. */
export function registerDomainStatus(definition: DomainStatusDefinition): void {
  EXTRA.set(normalizeKey(definition.key), { ...definition, key: normalizeKey(definition.key) });
}

export function isKnownDomainStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  const key = normalizeKey(status);
  return CORE_KEYS.has(key) || EXTRA.has(key);
}

/**
 * Resolve presentation for a domain status.
 * Unmapped values return neutral tone and are recorded for architecture review.
 */
export function resolveDomainStatus(
  status: string | null | undefined,
): StatusDisplay & { unmapped: boolean } {
  if (!status) return { label: "—", tone: "neutral", unmapped: false };
  const key = normalizeKey(status);
  const extra = EXTRA.get(key);
  if (extra) {
    return {
      label: extra.label,
      tone: extra.tone,
      ...(extra.muted !== undefined ? { muted: extra.muted } : {}),
      unmapped: false,
    };
  }
  if (CORE_KEYS.has(key)) {
    return { ...statusDisplay(status), unmapped: false };
  }
  UNMAPPED_SEEN.add(key);
  return { label: humanizeStatus(status), tone: "neutral", unmapped: true };
}

// Ensure Section 3 statuses exist even when the core MAP lags.
registerDomainStatus({ key: "locked", label: "Locked", tone: "neutral" });
registerDomainStatus({ key: "scheduled", label: "Scheduled", tone: "info" });
registerDomainStatus({ key: "synced", label: "Synced", tone: "success" });
registerDomainStatus({ key: "needs_attention", label: "Needs attention", tone: "warning" });

export function consumeUnmappedStatuses(): string[] {
  const values = [...UNMAPPED_SEEN].sort();
  UNMAPPED_SEEN.clear();
  return values;
}

export function peekUnmappedStatuses(): string[] {
  return [...UNMAPPED_SEEN].sort();
}
