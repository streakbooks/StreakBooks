/**
 * Webhook ingress security helpers.
 * Providers must verify signatures before processing; replay windows are enforced.
 */

export type WebhookVerificationResult =
  | { ok: true }
  | { ok: false; reason: "missing_signature" | "invalid_signature" | "replay" | "stale" };

const DEFAULT_REPLAY_WINDOW_MS = 5 * 60 * 1000;

export function assertWebhookTimestampFresh(
  timestampSeconds: number,
  nowMs: number = Date.now(),
  windowMs: number = DEFAULT_REPLAY_WINDOW_MS,
): WebhookVerificationResult {
  const eventMs = timestampSeconds * 1000;
  if (!Number.isFinite(eventMs) || eventMs <= 0) {
    return { ok: false, reason: "stale" };
  }
  if (Math.abs(nowMs - eventMs) > windowMs) {
    return { ok: false, reason: "stale" };
  }
  return { ok: true };
}

export function assertWebhookNotReplayed(
  providerEventId: string,
  seenEventIds: ReadonlySet<string>,
): WebhookVerificationResult {
  if (!providerEventId.trim()) {
    return { ok: false, reason: "missing_signature" };
  }
  if (seenEventIds.has(providerEventId)) {
    return { ok: false, reason: "replay" };
  }
  return { ok: true };
}

/**
 * Constant-time string compare for HMAC hex digests.
 * Callers compute expected digest with provider secrets (never client-side).
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export function verifyWebhookSignature(input: {
  providedSignature: string | null | undefined;
  expectedSignature: string;
}): WebhookVerificationResult {
  if (!input.providedSignature) {
    return { ok: false, reason: "missing_signature" };
  }
  if (!timingSafeEqualHex(input.providedSignature, input.expectedSignature)) {
    return { ok: false, reason: "invalid_signature" };
  }
  return { ok: true };
}
