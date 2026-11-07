/**
 * Cross-company isolation helpers for marketplace operations.
 * Server RPCs remain authoritative; these guards fail closed in application code.
 */

export class CrossTenantAccessError extends Error {
  readonly code = "cross_tenant_denied";

  constructor(message = "Cross-company marketplace access denied.") {
    super(message);
    this.name = "CrossTenantAccessError";
  }
}

export function assertSameCompany(
  resourceCompanyId: string | null | undefined,
  activeCompanyId: string | null | undefined,
  label = "resource",
): void {
  if (!activeCompanyId) {
    throw new CrossTenantAccessError("No active organisation selected.");
  }
  if (!resourceCompanyId) {
    throw new CrossTenantAccessError(`${label} has no company scope.`);
  }
  if (resourceCompanyId !== activeCompanyId) {
    throw new CrossTenantAccessError(
      `${label} belongs to another organisation and cannot be accessed.`,
    );
  }
}

export function filterToCompany<T extends { companyId: string }>(
  rows: readonly T[],
  companyId: string,
): T[] {
  return rows.filter((row) => row.companyId === companyId);
}

/** Detects obvious scope escalation attempts in requested OAuth scopes. */
export function detectDangerousScopeEscalation(
  requested: readonly string[],
  allowed: readonly string[],
): string[] {
  const allow = new Set(allowed);
  return requested.filter((scope) => !allow.has(scope));
}
