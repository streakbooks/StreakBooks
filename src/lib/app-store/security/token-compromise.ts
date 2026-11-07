/**
 * Token compromise response — rotate or revoke immediately; never leave tokens usable.
 */

import type { StoredCredentialRef, TokenVault } from "@/lib/app-store/engine/oauth-token";
import { isTokenExpired } from "@/lib/app-store/engine/oauth-token";

export type TokenCompromiseAction = "rotate" | "revoke" | "already_revoked";

export type TokenCompromiseResult = {
  action: TokenCompromiseAction;
  credentialRef: string;
  companyId: string;
  connectionId: string;
};

export async function respondToTokenCompromise(
  vault: TokenVault,
  meta: StoredCredentialRef,
  options: { preferRotate?: boolean } = {},
): Promise<TokenCompromiseResult> {
  if (meta.revokedAt) {
    return {
      action: "already_revoked",
      credentialRef: meta.credentialRef,
      companyId: meta.companyId,
      connectionId: meta.connectionId,
    };
  }

  const preferRotate = options.preferRotate !== false;
  const expired = isTokenExpired(meta.expiresAt);

  if (preferRotate && !expired) {
    try {
      const rotated = await vault.refresh(meta.credentialRef);
      // Immediate revoke of prior material is vault-internal; callers treat refresh as rotation.
      return {
        action: "rotate",
        credentialRef: rotated.credentialRef,
        companyId: rotated.companyId,
        connectionId: rotated.connectionId,
      };
    } catch {
      // Fall through to hard revoke.
    }
  }

  await vault.revoke(meta.credentialRef);
  return {
    action: "revoke",
    credentialRef: meta.credentialRef,
    companyId: meta.companyId,
    connectionId: meta.connectionId,
  };
}

/** Detects obvious token leakage patterns before any logging. */
export function containsRawTokenMaterial(payload: string): boolean {
  const patterns = [
    /Bearer\s+[A-Za-z0-9\-._~+/]+=*/i,
    /"access_token"\s*:/,
    /"refresh_token"\s*:/,
    /sk_live_[A-Za-z0-9]+/,
    /shpat_[A-Za-z0-9]+/,
  ];
  return patterns.some((re) => re.test(payload));
}
