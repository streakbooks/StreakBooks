/**
 * OAuth 2.0 / token lifecycle contracts.
 * Tokens must never be returned to the client UI.
 * Storage uses opaque credential_ref pointers only.
 */

export type OAuthTokenSet = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scopes: string[];
  tokenType: string;
};

export type StoredCredentialRef = {
  credentialRef: string;
  connectionId: string;
  companyId: string;
  expiresAt: string | null;
  revokedAt: string | null;
};

export type TokenVault = {
  store(input: {
    companyId: string;
    connectionId: string;
    tokens: OAuthTokenSet;
  }): Promise<StoredCredentialRef>;
  refresh(credentialRef: string): Promise<StoredCredentialRef>;
  revoke(credentialRef: string): Promise<void>;
  /** Never expose raw tokens to callers outside the vault boundary. */
  peekMeta(credentialRef: string): Promise<Omit<StoredCredentialRef, never>>;
};

export function isTokenExpired(
  expiresAt: string | null,
  nowMs: number = Date.now(),
  skewMs = 60_000,
): boolean {
  if (!expiresAt) return false;
  const ms = Date.parse(expiresAt);
  if (!Number.isFinite(ms)) return true;
  return ms <= nowMs + skewMs;
}

export function assertRedirectUriAllowed(
  redirectUri: string,
  allowlist: readonly string[],
): boolean {
  try {
    const url = new URL(redirectUri);
    if (url.protocol !== "https:" && url.hostname !== "localhost") return false;
    return allowlist.some((allowed) => allowed === redirectUri);
  } catch {
    return false;
  }
}

/** Placeholder vault — real encryption/KMS lands with credentials. */
export function createUnconfiguredTokenVault(): TokenVault {
  return {
    async store() {
      throw new Error("OAuth token vault is not configured. Do not claim connections are active.");
    },
    async refresh() {
      throw new Error("OAuth token vault is not configured.");
    },
    async revoke() {
      throw new Error("OAuth token vault is not configured.");
    },
    async peekMeta() {
      throw new Error("OAuth token vault is not configured.");
    },
  };
}
