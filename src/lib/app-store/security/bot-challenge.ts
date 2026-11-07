/**
 * Lightweight bot / abuse challenge helpers.
 * Not a CAPTCHA replacement — pairs with rate limits and fail-closed activation.
 */

export type BotChallenge = {
  challengeId: string;
  issuedAtMs: number;
  expiresAtMs: number;
  /** Honeypot field name expected to remain empty in forms. */
  honeypotField: string;
};

export type BotChallengeValidation =
  { ok: true } | { ok: false; reason: "expired" | "honeypot" | "missing" | "mismatch" | "timing" };

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const base64 = typeof btoa === "function" ? btoa(binary) : Buffer.from(binary).toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function issueBotChallenge(input?: { nowMs?: number; ttlMs?: number }): BotChallenge {
  const nowMs = input?.nowMs ?? Date.now();
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return {
    challengeId: toBase64Url(bytes),
    issuedAtMs: nowMs,
    expiresAtMs: nowMs + (input?.ttlMs ?? 10 * 60 * 1000),
    honeypotField: "marketplace_company_website",
  };
}

export function validateBotChallenge(input: {
  challenge: BotChallenge | null | undefined;
  presentedChallengeId: string | null | undefined;
  honeypotValue: string | null | undefined;
  nowMs?: number;
  minSolveMs?: number;
}): BotChallengeValidation {
  const nowMs = input.nowMs ?? Date.now();
  if (!input.challenge || !input.presentedChallengeId) {
    return { ok: false, reason: "missing" };
  }
  if (input.challenge.challengeId !== input.presentedChallengeId) {
    return { ok: false, reason: "mismatch" };
  }
  if (input.challenge.expiresAtMs <= nowMs) {
    return { ok: false, reason: "expired" };
  }
  if (typeof input.honeypotValue === "string" && input.honeypotValue.trim().length > 0) {
    return { ok: false, reason: "honeypot" };
  }
  const minSolveMs = input.minSolveMs ?? 400;
  if (nowMs - input.challenge.issuedAtMs < minSolveMs) {
    return { ok: false, reason: "timing" };
  }
  return { ok: true };
}

/** Server-derived scrape fingerprint — never trust raw client IPs alone. */
export function deriveCatalogueFingerprint(parts: {
  userAgent?: string | null;
  acceptLanguage?: string | null;
  sessionHint?: string | null;
}): string {
  const raw = [
    parts.userAgent?.slice(0, 120) ?? "",
    parts.acceptLanguage?.slice(0, 40) ?? "",
    parts.sessionHint?.slice(0, 64) ?? "",
  ].join("|");
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }
  return `c${hash.toString(16).padStart(8, "0")}${raw.length.toString(16)}`;
}
