import { assertCompanyPermission } from "@/lib/assert-company-access";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertUuid } from "@/lib/company-validation";

export const listMyFirms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: memberships, error } = await context.supabase
      .from("firm_members" as never)
      .select("role, firm_id, firms(id, name, created_at)" as never)
      .eq("user_id" as never, context.userId as never);
    if (error) throw new Error(error.message);
    return (memberships ?? []).map((m) => {
      const row = m as {
        role: string;
        firm_id: string;
        firms: { id: string; name: string; created_at: string } | null;
      };
      return {
        firmId: row.firm_id,
        role: row.role,
        name: row.firms?.name ?? "Firm",
        createdAt: row.firms?.created_at ?? null,
      };
    });
  });

export const createFirm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name: string }) => {
    const name = (input.name ?? "").trim();
    if (name.length < 2) throw new Error("Firm name is required");
    if (name.length > 120) throw new Error("Firm name must not exceed 120 characters");
    return { name };
  })
  .handler(async ({ data, context }) => {
    const { data: firmId, error } = await context.supabase.rpc(
      "create_practice_firm" as never,
      { _name: data.name } as never,
    );
    if (error) throw new Error(error.message);
    return { id: String(firmId) };
  });

export const listFirmClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { firmId: string }) => ({ firmId: assertUuid(input.firmId) }))
  .handler(async ({ data, context }) => {
    const { data: member, error: memberError } = await context.supabase
      .from("firm_members" as never)
      .select("id" as never)
      .eq("firm_id" as never, data.firmId as never)
      .eq("user_id" as never, context.userId as never)
      .maybeSingle();
    if (memberError) throw new Error(memberError.message);
    if (!member) throw new Error("Not a member of this firm");

    const { data: links, error } = await context.supabase
      .from("firm_client_links" as never)
      .select("id, company_id, access_level, revoked_at, created_at, companies(name)" as never)
      .eq("firm_id" as never, data.firmId as never)
      .is("revoked_at" as never, null)
      .order("created_at" as never, { ascending: false });
    if (error) throw new Error(error.message);
    return (links ?? []) as Array<{
      id: string;
      company_id: string;
      access_level: string;
      companies: { name: string } | null;
    }>;
  });

/**
 * Link a client company the caller already owns/admins, and materialize company_membership
 * for all current firm members at the mapped role.
 */
export const linkFirmClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { firmId: string; companyId: string; accessLevel: string }) => {
    if (!["view", "bookkeep", "full"].includes(input.accessLevel)) {
      throw new Error("Invalid access level");
    }
    return {
      firmId: assertUuid(input.firmId),
      companyId: assertUuid(input.companyId),
      accessLevel: input.accessLevel,
    };
  })
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc(
      "manage_practice_client" as never,
      {
        _firm_id: data.firmId,
        _company_id: data.companyId,
        _access: data.accessLevel,
        _revoke: false,
      } as never,
    );
    if (error) throw new Error(error.message);
    return result as { id: string; created: number };
  });

export const revokeFirmClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { firmId: string; companyId: string }) => ({
    firmId: assertUuid(input.firmId),
    companyId: assertUuid(input.companyId),
  }))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc(
      "manage_practice_client" as never,
      {
        _firm_id: data.firmId,
        _company_id: data.companyId,
        _access: null,
        _revoke: true,
      } as never,
    );
    if (error) throw new Error(error.message);
    return result as { removed: number; retained: number };
  });

/** Client activity for a linked company (audit slice) — firm members with company access. */
export const listFirmClientActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { firmId: string; companyId: string }) => ({
    firmId: assertUuid(input.firmId),
    companyId: assertUuid(input.companyId),
  }))
  .handler(async ({ data, context }) => {
    const { data: member, error: memberError } = await context.supabase
      .from("firm_members" as never)
      .select("id" as never)
      .eq("firm_id" as never, data.firmId as never)
      .eq("user_id" as never, context.userId as never)
      .maybeSingle();
    if (memberError) throw new Error(memberError.message);
    if (!member) throw new Error("Not a member of this firm");

    const { data: link } = await context.supabase
      .from("firm_client_links" as never)
      .select("id" as never)
      .eq("firm_id" as never, data.firmId as never)
      .eq("company_id" as never, data.companyId as never)
      .is("revoked_at" as never, null)
      .maybeSingle();
    if (!link) throw new Error("Client is not linked to this firm");

    await assertCompanyPermission(context.supabase, data.companyId, "audit.view");

    const { data: rows, error } = await context.supabase
      .from("audit_events" as never)
      .select("id, action, entity_type, entity_id, created_at, actor_user_id" as never)
      .eq("company_id" as never, data.companyId as never)
      .order("created_at" as never, { ascending: false })
      .limit(40);
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{
      id: string;
      action: string;
      entity_type: string;
      entity_id: string | null;
      created_at: string;
      actor_user_id: string | null;
    }>;
  });
