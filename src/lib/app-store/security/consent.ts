/**
 * Customer consent grant/revoke helpers (application layer).
 * Authoritative persistence is via grant_app_connection_consent / revoke RPCs.
 */

export type ConsentGrantInput = {
  companyId: string;
  appCode: string;
  connectionId: string | null;
  requestedScopes: readonly string[];
  allowedScopes: readonly string[];
  consentVersion?: string;
};

export type ConsentGrantDecision =
  | {
      ok: true;
      grantedScopes: string[];
      consentVersion: string;
    }
  | {
      ok: false;
      reason: "empty_scopes" | "scope_escalation" | "missing_company" | "missing_app";
      deniedScopes?: string[];
    };

export function decideConsentGrant(input: ConsentGrantInput): ConsentGrantDecision {
  if (!input.companyId.trim()) return { ok: false, reason: "missing_company" };
  if (!input.appCode.trim()) return { ok: false, reason: "missing_app" };

  const allow = new Set(input.allowedScopes);
  const denied = input.requestedScopes.filter((scope) => !allow.has(scope));
  if (denied.length > 0) {
    return { ok: false, reason: "scope_escalation", deniedScopes: denied };
  }

  const grantedScopes = [...new Set(input.requestedScopes.filter((s) => allow.has(s)))];
  if (grantedScopes.length === 0) {
    return { ok: false, reason: "empty_scopes" };
  }

  return {
    ok: true,
    grantedScopes,
    consentVersion: input.consentVersion?.trim() || "1",
  };
}
