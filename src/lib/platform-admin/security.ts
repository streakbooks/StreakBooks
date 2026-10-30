/**
 * Platform permissions are independent of organisation roles.
 * The client never decides who can invoke a privileged operation.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type PlatformRole = "platform_owner" | "platform_finance" | "platform_support";
export type PlatformScope = "overview" | "organisations" | "billing" | "audit" | "manage";

const ALLOWED: Record<PlatformRole, readonly PlatformScope[]> = {
  platform_owner: ["overview", "organisations", "billing", "audit", "manage"],
  platform_finance: ["overview", "organisations", "billing"],
  platform_support: ["overview", "organisations"],
};

export function isPlatformRole(value: unknown): value is PlatformRole {
  return value === "platform_owner" || value === "platform_finance" || value === "platform_support";
}

export function hasPlatformScope(role: PlatformRole | null, scope: PlatformScope): boolean {
  return role != null && ALLOWED[role].includes(scope);
}

export function requirePlatformMfa(claims: { aal?: unknown } | null | undefined): void {
  if (claims?.aal !== "aal2") {
    throw new Error("Platform administration requires an authenticated MFA (AAL2) session. Set up two-step verification in your profile, then sign in again.");
  }
}

export function validateReason(value: unknown): string {
  const reason = typeof value === "string" ? value.trim() : "";
  if (reason.length < 12 || reason.length > 500) {
    throw new Error("Enter a reason between 12 and 500 characters for the audit log.");
  }
  return reason;
}

export async function requirePlatformScope(
  supabase: SupabaseClient<Database>,
  claims: { aal?: unknown } | null | undefined,
  scope: PlatformScope,
): Promise<PlatformRole> {
  // Role checked from the database on every request, never from user_metadata,
  // query strings, the browser or a possibly stale user-controlled JWT claim.
  const { data, error } = await supabase.rpc("platform_role" as never);
  if (error) throw new Error("Unable to verify platform permissions: " + error.message);
  if (!isPlatformRole(data) || !hasPlatformScope(data, scope)) {
    throw new Error("Access denied. This account does not have the required LinkBooks platform role.");
  }
  requirePlatformMfa(claims);
  return data;
}
