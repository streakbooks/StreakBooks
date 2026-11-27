/** Pure helpers for QuickBooks-style plan-change previews (no provider I/O). */

export function remainingBillingDays(
  periodEndIso: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!periodEndIso) return null;
  const end = Date.parse(periodEndIso);
  if (!Number.isFinite(end)) return null;
  const ms = end - now.getTime();
  if (ms <= 0) return 0;
  return Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

/**
 * Estimate remaining-period proration when the provider has no invoice-preview API.
 * Razorpay applies the authoritative amount on update; this is customer-facing estimate only.
 */
export function estimateProratedDifferenceMinor(input: {
  currentAmountMinor: number;
  targetAmountMinor: number;
  periodStartIso: string | null | undefined;
  periodEndIso: string | null | undefined;
  now?: Date;
}): number {
  const now = input.now ?? new Date();
  const end = input.periodEndIso ? Date.parse(input.periodEndIso) : NaN;
  const start = input.periodStartIso ? Date.parse(input.periodStartIso) : NaN;
  const delta = input.targetAmountMinor - input.currentAmountMinor;
  if (!Number.isFinite(end) || end <= now.getTime()) return 0;
  if (!Number.isFinite(start) || start >= end) {
    // Fall back to full-period difference when cycle start is unknown.
    return Math.max(0, delta);
  }
  const remaining = end - now.getTime();
  const total = end - start;
  if (total <= 0) return 0;
  return Math.max(0, Math.round((delta * remaining) / total));
}

export type RazorpayMandateKind = "card" | "upi" | "emandate" | "unknown";

export function razorpayMandateKindFromNotes(
  notes: Record<string, unknown> | null | undefined,
  paymentMethod: string | null | undefined,
): RazorpayMandateKind {
  const fromNotes = String(notes?.["pay_method"] ?? "")
    .trim()
    .toLowerCase();
  const fromMethod = String(paymentMethod ?? "")
    .trim()
    .toLowerCase();
  const raw = fromNotes || fromMethod;
  if (raw === "upi" || raw.includes("upi")) return "upi";
  if (raw === "emandate" || raw.includes("emandate") || raw.includes("nach")) return "emandate";
  if (raw === "card" || raw.includes("card")) return "card";
  return "unknown";
}

/** Immediate in-place plan updates are only supported for card-authorised Razorpay subs. */
export function razorpaySupportsImmediatePlanChange(kind: RazorpayMandateKind): boolean {
  return kind === "card";
}
