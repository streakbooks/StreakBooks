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

/**
 * Ephemeral in-memory vault for unit tests only.
 * Never use in production — no encryption, no durability.
 */
export function createEphemeralMemoryTokenVault(): TokenVault {
  const byRef = new Map<
    string,
    StoredCredentialRef & { tokens: OAuthTokenSet | null; generation: number }
  >();
  let seq = 0;

  return {
    async store(input) {
      seq += 1;
      const credentialRef = `mem_${input.companyId}_${input.connectionId}_${seq}`;
      const meta: StoredCredentialRef & { tokens: OAuthTokenSet | null; generation: number } = {
        credentialRef,
        connectionId: input.connectionId,
        companyId: input.companyId,
        expiresAt: input.tokens.expiresAt,
        revokedAt: null,
        tokens: { ...input.tokens },
        generation: 1,
      };
      byRef.set(credentialRef, meta);
      return {
        credentialRef,
        connectionId: meta.connectionId,
        companyId: meta.companyId,
        expiresAt: meta.expiresAt,
        revokedAt: null,
      };
    },
    async refresh(credentialRef) {
      const existing = byRef.get(credentialRef);
      if (!existing || existing.revokedAt || !existing.tokens) {
        throw new Error("Cannot refresh revoked or missing credential.");
      }
      existing.generation += 1;
      existing.tokens = {
        ...existing.tokens,
        accessToken: `rotated_${existing.generation}`,
      };
      const nextRef = `${credentialRef}_r${existing.generation}`;
      byRef.delete(credentialRef);
      byRef.set(nextRef, { ...existing, credentialRef: nextRef });
      return {
        credentialRef: nextRef,
        connectionId: existing.connectionId,
        companyId: existing.companyId,
        expiresAt: existing.expiresAt,
        revokedAt: null,
      };
    },
    async revoke(credentialRef) {
      const existing = byRef.get(credentialRef);
      if (!existing) return;
      existing.revokedAt = new Date().toISOString();
      existing.tokens = null;
    },
    async peekMeta(credentialRef) {
      const existing = byRef.get(credentialRef);
      if (!existing) throw new Error("Credential not found.");
      return {
        credentialRef: existing.credentialRef,
        connectionId: existing.connectionId,
        companyId: existing.companyId,
        expiresAt: existing.expiresAt,
        revokedAt: existing.revokedAt,
      };
    },
  };
}
