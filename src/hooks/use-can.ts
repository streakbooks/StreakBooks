import { permissionsForRole, type Permission } from "@/lib/permissions";
import { useActiveCompany } from "@/hooks/use-active-company";

function mergeOwnerAdminPermissions(
  role: string | null | undefined,
  fromServer: Permission[] | undefined,
): Permission[] {
  const baseline = permissionsForRole(role);
  if (!fromServer) return [...baseline];
  // Owner/admin always receive the current TypeScript role catalogue so newly
  // registered module keys appear as soon as permissions.ts ships. RLS/RPC remain
  // the real enforcement — this only prevents stale UI gates after migrations.
  if (role === "owner" || role === "admin") {
    return Array.from(new Set<Permission>([...fromServer, ...baseline]));
  }
  return [...fromServer];
}

/**
 * UI permission hint based on the active company's role (P-26).
 * This only decides whether to show or enable a control. The server functions and
 * row-level security remain the real enforcement, so a missing permission here
 * must never be the only protection for an action.
 *
 * While the company is still loading everything is reported as not allowed so a
 * button is never briefly offered and then taken away.
 */
export function useCan() {
  const { company } = useActiveCompany();
  const granted = company
    ? mergeOwnerAdminPermissions(company.role, company.permissions)
    : [];
  const can = (permission: Permission): boolean => granted.includes(permission);
  return { can, role: company?.role ?? null, ready: Boolean(company) };
}

/** Convenience wrapper for a single permission. */
export function useCanDo(permission: Permission): boolean {
  return useCan().can(permission);
}