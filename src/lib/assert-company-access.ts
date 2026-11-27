import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { Permission } from "@/lib/permissions";

type AuthedClient = SupabaseClient<Database>;

/**
 * Server-side authorisation helper. Prefer this in addition to RLS so failed
 * permission checks return a clear error instead of an empty update.
 */
export async function assertCompanyPermission(
  supabase: AuthedClient,
  companyId: string,
  permission: Permission,
): Promise<void> {
  const { data, error } = await supabase.rpc("has_company_permission", {
    _company_id: companyId,
    _permission: permission,
  });
  if (error) throw new Error(error.message);
  if (!data) {
    throw new Error("You do not have permission to perform this action for this organisation.");
  }
  const { error: auditError } = await supabase.rpc(
    "record_firm_client_access" as never,
    { _company_id: companyId, _module_key: permission.split(".", 1)[0] } as never,
  );
  if (auditError) throw new Error(auditError.message);
}

/** Assert one of several equivalent permissions, then record one access event. */
export async function assertCompanyPermissionAny(
  supabase: AuthedClient,
  companyId: string,
  permissions: readonly Permission[],
): Promise<void> {
  if (permissions.length === 0) {
    throw new Error("At least one organisation permission is required.");
  }

  for (const permission of permissions) {
    const { data, error } = await supabase.rpc("has_company_permission", {
      _company_id: companyId,
      _permission: permission,
    });
    if (error) throw new Error(error.message);
    if (!data) continue;

    const { error: auditError } = await supabase.rpc(
      "record_firm_client_access" as never,
      { _company_id: companyId, _module_key: permission.split(".", 1)[0] } as never,
    );
    if (auditError) throw new Error(auditError.message);
    return;
  }

  throw new Error("You do not have permission to perform this action for this organisation.");
}

export async function assertCompanyMember(
  supabase: AuthedClient,
  companyId: string,
): Promise<void> {
  const { data, error } = await supabase.rpc("is_company_member", {
    _company_id: companyId,
  });
  if (error) throw new Error(error.message);
  if (!data) {
    throw new Error("You do not have access to that organisation.");
  }
  const { error: auditError } = await supabase.rpc(
    "record_firm_client_access" as never,
    { _company_id: companyId, _module_key: "company" } as never,
  );
  if (auditError) throw new Error(auditError.message);
}
