/**
 * OAuth 2.0 Authorization Code + PKCE helpers.
 * Code verifiers never leave the server/vault boundary.
 */

const PKCE_METHOD = "S256" as const;

export type PkceChallenge = {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: typeof PKCE_METHOD;
};

export type OAuthStateRecord = {
  state: string;
  companyId: string;
  appCode: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: typeof PKCE_METHOD;
  expiresAtMs: number;
  used: boolean;
};

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const base64 = typeof btoa === "function" ? btoa(binary) : Buffer.from(binary).toString("base64");
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomUrlSafe(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

/** RFC 7636 S256 code_challenge = BASE64URL(SHA256(verifier)). */
export async function createPkceChallenge(
  codeVerifier: string = randomUrlSafe(32),
): Promise<PkceChallenge> {
  const data = new TextEncoder().encode(codeVerifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return {
    codeVerifier,
    codeChallenge: toBase64Url(new Uint8Array(digest)),
    codeChallengeMethod: PKCE_METHOD,
  };
}

export function createOAuthState(input: {
  companyId: string;
  appCode: string;
  redirectUri: string;
  codeChallenge: string;
  ttlMs?: number;
  nowMs?: number;
}): OAuthStateRecord {
  const nowMs = input.nowMs ?? Date.now();
  return {
    state: randomUrlSafe(24),
    companyId: input.companyId,
    appCode: input.appCode,
    redirectUri: input.redirectUri,
    codeChallenge: input.codeChallenge,
    codeChallengeMethod: PKCE_METHOD,
    expiresAtMs: nowMs + (input.ttlMs ?? 10 * 60 * 1000),
    used: false,
  };
}

export type OAuthStateValidation =
  | { ok: true; record: OAuthStateRecord }
  | {
      ok: false;
      reason: "missing" | "expired" | "replay" | "mismatch" | "company_mismatch";
    };

export function validateOAuthCallbackState(input: {
  stored: OAuthStateRecord | null | undefined;
  presentedState: string;
  companyId: string;
  appCode: string;
  redirectUri: string;
  nowMs?: number;
}): OAuthStateValidation {
  const nowMs = input.nowMs ?? Date.now();
  if (!input.stored) return { ok: false, reason: "missing" };
  if (input.stored.used) return { ok: false, reason: "replay" };
  if (input.stored.expiresAtMs <= nowMs) return { ok: false, reason: "expired" };
  if (input.stored.state !== input.presentedState) return { ok: false, reason: "mismatch" };
  if (input.stored.companyId !== input.companyId) {
    return { ok: false, reason: "company_mismatch" };
  }
  if (input.stored.appCode !== input.appCode || input.stored.redirectUri !== input.redirectUri) {
    return { ok: false, reason: "mismatch" };
  }
  return { ok: true, record: input.stored };
}

export function markOAuthStateUsed(record: OAuthStateRecord): OAuthStateRecord {
  return { ...record, used: true };
}
