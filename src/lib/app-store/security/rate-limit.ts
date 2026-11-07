/**
 * Client-side / in-process rate limit helpers for marketplace APIs.
 * Authoritative enforcement lives in private.marketplace_rate_limit (Postgres).
 */

export type RateLimitDecision =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterMs: number; reason: "rate_limited" };

export type RateBucketSnapshot = {
  timestamps: number[];
};

export function evaluateRateLimit(input: {
  nowMs: number;
  windowMs: number;
  max: number;
  priorTimestamps: readonly number[];
}): RateLimitDecision & { nextTimestamps: number[] } {
  const cutoff = input.nowMs - input.windowMs;
  const active = input.priorTimestamps.filter((t) => t >= cutoff);
  if (active.length >= input.max) {
    const oldest = Math.min(...active);
    return {
      allowed: false,
      retryAfterMs: Math.max(0, oldest + input.windowMs - input.nowMs),
      reason: "rate_limited",
      nextTimestamps: active,
    };
  }
  const nextTimestamps = [...active, input.nowMs];
  return {
    allowed: true,
    remaining: Math.max(0, input.max - nextTimestamps.length),
    nextTimestamps,
  };
}

/** Heuristic abuse scoring for monitoring (not a substitute for WAF). */
export function scoreSuspiciousActivity(signals: {
  failedAuthCount: number;
  crossTenantAttempts: number;
  rateLimitHits: number;
  invalidWebhookCount: number;
}): { score: number; severity: "low" | "medium" | "high" | "critical" } {
  const score =
    signals.failedAuthCount * 2 +
    signals.crossTenantAttempts * 10 +
    signals.rateLimitHits * 3 +
    signals.invalidWebhookCount * 4;
  if (score >= 40) return { score, severity: "critical" };
  if (score >= 20) return { score, severity: "high" };
  if (score >= 8) return { score, severity: "medium" };
  return { score, severity: "low" };
}
