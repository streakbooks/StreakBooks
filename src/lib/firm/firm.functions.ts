import { assertCompanyPermission } from "@/lib/assert-company-access";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertUuid } from "@/lib/company-validation";
import { z } from "zod";

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

    const { data: links, error } = await context.supabase.rpc(
      "firm_client_portfolio" as never,
      { _firm_id: data.firmId } as never,
    );
    if (error) throw new Error(error.message);
    return (
      (links ?? []) as Array<{
        company_id: string;
        company_name: string;
        access_level: string;
        role: string | null;
      }>
    ).map((link) => ({
      id: link.company_id,
      company_id: link.company_id,
      access_level: link.access_level,
      companies: { name: link.company_name },
      role: link.role,
    }));
  });

/**
 * Link a client company the caller already administers. The RPC creates a scoped firm grant;
 * firm staff remain outside the client's company-member count.
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

export const listFirmClientAccessLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: assertUuid(input.companyId) }))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc(
      "firm_client_access_log" as never,
      { _company_id: data.companyId } as never,
    );
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{
      user_id: string;
      user_name: string;
      module_key: string;
      accessed_at: string;
    }>;
  });

/** Record a firm staff member opening a client workspace module. */
export const recordFirmClientModuleAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        moduleKey: z.string().regex(/^[a-z][a-z0-9_.-]{0,63}$/),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc(
      "record_firm_client_access" as never,
      { _company_id: data.companyId, _module_key: data.moduleKey } as never,
    );
    if (error) throw new Error(error.message);
    return { recorded: true };
  });

export const listFirmClientAccessGrants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ firmId: z.string().uuid(), companyId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("firm_client_access_grants" as never)
      .select("user_id,role,revoked_at" as never)
      .eq("firm_id" as never, data.firmId as never)
      .eq("company_id" as never, data.companyId as never)
      .is("revoked_at" as never, null);
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{ user_id: string; role: string; revoked_at: null }>;
  });

export const saveFirmClientAccessGrant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        firmId: z.string().uuid(),
        companyId: z.string().uuid(),
        userId: z.string().uuid(),
        role: z.enum(["read_only", "staff", "bookkeeper", "accountant", "admin"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: admin, error: adminError } = await context.supabase.rpc(
      "is_firm_admin" as never,
      { _firm_id: data.firmId } as never,
    );
    if (adminError) throw new Error(adminError.message);
    if (!admin) throw new Error("Firm owner or administrator access required");
    const { error } = await context.supabase.from("firm_client_access_grants" as never).upsert(
      {
        firm_id: data.firmId,
        company_id: data.companyId,
        user_id: data.userId,
        role: data.role,
        granted_by: context.userId,
        revoked_at: null,
      } as never,
      { onConflict: "firm_id,company_id,user_id" },
    );
    if (error) throw new Error(error.message);
    return { saved: true };
  });

export const revokeFirmClientAccessGrant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        firmId: z.string().uuid(),
        companyId: z.string().uuid(),
        userId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: admin, error: adminError } = await context.supabase.rpc(
      "is_firm_admin" as never,
      { _firm_id: data.firmId } as never,
    );
    if (adminError) throw new Error(adminError.message);
    if (!admin) throw new Error("Firm owner or administrator access required");
    const { error } = await context.supabase
      .from("firm_client_access_grants" as never)
      .update({
        revoked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as never)
      .eq("firm_id" as never, data.firmId as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("user_id" as never, data.userId as never);
    if (error) throw new Error(error.message);
    return { revoked: true };
  });

export const requestFirmClientPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        firmId: z.string().uuid(),
        companyId: z.string().uuid(),
        userId: z.string().uuid(),
        permissionKeys: z
          .array(
            z.enum([
              "accounting.post",
              "sales.draft",
              "purchases.draft",
              "expenses.submit",
              "banking.feeds.manage",
              "banking.reconcile",
              "members.manage",
              "company.settings.edit",
              "billing.manage",
              "tax.settings",
            ]),
          )
          .min(1)
          .max(10),
        requestReason: z.string().trim().min(10).max(1000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("firm_client_permission_requests" as never)
      .insert({
        firm_id: data.firmId,
        company_id: data.companyId,
        user_id: data.userId,
        permission_keys: [...new Set(data.permissionKeys)],
        request_reason: data.requestReason,
        requested_by: context.userId,
        status: "pending",
      } as never);
    if (error) throw new Error(error.message);
    return { requested: true };
  });

export const listFirmClientPermissionRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ companyId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc(
      "firm_client_pending_requests" as never,
      { _company_id: data.companyId } as never,
    );
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{
      id: string;
      firm_name: string;
      staff_name: string;
      permission_keys: string[];
      request_reason: string;
      requested_at: string;
    }>;
  });

export const listFirmClientConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ companyId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc(
      "firm_client_connections" as never,
      { _company_id: data.companyId } as never,
    );
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{ firm_id: string; firm_name: string; linked_at: string }>;
  });

export const disconnectFirmClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ firmId: z.string().uuid(), companyId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: disconnected, error } = await context.supabase.rpc(
      "disconnect_firm_client" as never,
      { _firm_id: data.firmId, _company_id: data.companyId } as never,
    );
    if (error) throw new Error(error.message);
    return { disconnected: Boolean(disconnected) };
  });

export const reviewFirmClientPermissionRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        requestId: z.string().uuid(),
        companyId: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        reviewReason: z.string().trim().min(3).max(1000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "members.manage");
    const { error } = await context.supabase
      .from("firm_client_permission_requests" as never)
      .update({
        status: data.decision,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
        review_reason: data.reviewReason,
      } as never)
      .eq("id" as never, data.requestId as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("status" as never, "pending" as never);
    if (error) throw new Error(error.message);
    return { reviewed: true };
  });
