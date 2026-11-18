import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { isPermission, normaliseAdjustments, type AccessAdjustment } from "@/lib/access-catalogue";
import type { CompanyRole } from "@/lib/company-constants";
import { assertUuid } from "@/lib/company-validation";
import type { Permission } from "@/lib/permissions";

const ROLES: CompanyRole[] = ["owner", "admin", "accountant", "bookkeeper", "staff", "read_only"];

function asRole(value: string): CompanyRole {
  return ROLES.includes(value as CompanyRole) ? (value as CompanyRole) : "read_only";
}

function claimEmail(claims: unknown): string {
  if (!claims || typeof claims !== "object") return "";
  const email = (claims as { email?: unknown }).email;
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export const listMemberAdjustments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: assertUuid(input.companyId) }))
  .handler(
    async ({
      data,
      context,
    }): Promise<Array<{ userId: string; permission: Permission; effect: "grant" | "deny" }>> => {
      await assertCompanyPermission(context.supabase, data.companyId, "members.view");
      const { data: rows, error } = await context.supabase
        .from("member_permission_adjustments" as never)
        .select("user_id, permission, effect" as never)
        .eq("company_id" as never, data.companyId as never);
      if (error) throw new Error(error.message);
      return ((rows ?? []) as Array<{ user_id: string; permission: string; effect: string }>)
        .filter(
          (row): row is { user_id: string; permission: Permission; effect: "grant" | "deny" } =>
            isPermission(row.permission) && (row.effect === "grant" || row.effect === "deny"),
        )
        .map((row) => ({
          userId: row.user_id,
          permission: row.permission,
          effect: row.effect,
        }));
    },
  );

export const saveMemberAdjustments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      userId: string;
      role: CompanyRole;
      adjustments: AccessAdjustment[];
    }) => {
      if (!ROLES.includes(input.role) || input.role === "owner") {
        throw new Error("Owner access follows the owner role and cannot be customised");
      }
      return {
        companyId: assertUuid(input.companyId),
        userId: assertUuid(input.userId, "user"),
        adjustments: normaliseAdjustments(input.role, input.adjustments ?? []),
      };
    },
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "members.manage");
    const { error } = await context.supabase.rpc(
      "save_member_adjustments" as never,
      {
        _company_id: data.companyId,
        _user_id: data.userId,
        _adjustments: data.adjustments,
      } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const setMemberStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { companyId: string; userId: string; status: "active" | "suspended" }) => {
      if (input.status !== "active" && input.status !== "suspended") {
        throw new Error("Choose active or suspended");
      }
      return {
        companyId: assertUuid(input.companyId),
        userId: assertUuid(input.userId, "user"),
        status: input.status,
      };
    },
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "members.manage");
    if (data.userId === context.userId) throw new Error("You cannot change your own status");
    const { data: updated, error } = await context.supabase
      .from("company_members")
      .update({ status: data.status })
      .eq("company_id", data.companyId)
      .eq("user_id", data.userId)
      .select("user_id");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) {
      throw new Error("That person's status could not be changed.");
    }
    await context.supabase.rpc(
      "record_app_audit_event" as never,
      {
        _company_id: data.companyId,
        _action: data.status === "suspended" ? "members.suspend" : "members.reactivate",
        _entity_type: "company_member",
        _entity_id: data.userId,
        _details: { status: data.status },
      } as never,
    );
    return { ok: true as const };
  });

export const removeCompanyMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; userId: string }) => ({
    companyId: assertUuid(input.companyId),
    userId: assertUuid(input.userId, "user"),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "members.manage");
    if (data.userId === context.userId) throw new Error("You cannot remove your own access");
    const { data: removed, error } = await context.supabase
      .from("company_members")
      .delete()
      .eq("company_id", data.companyId)
      .eq("user_id", data.userId)
      .select("user_id");
    if (error) throw new Error(error.message);
    if (!removed || removed.length === 0) {
      throw new Error("That person could not be removed.");
    }
    await context.supabase.rpc(
      "record_app_audit_event" as never,
      {
        _company_id: data.companyId,
        _action: "members.remove",
        _entity_type: "company_member",
        _entity_id: data.userId,
        _details: {},
      } as never,
    );
    return { ok: true as const };
  });

export const previewCompanyInvitation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { token: string }) => {
    const token = (input.token ?? "").trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(token)) throw new Error("This invitation link is not valid");
    return { token };
  })
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc(
      "preview_company_invitation" as never,
      {
        _token: data.token,
      } as never,
    );
    if (error) throw new Error(error.message);
    const parsed = typeof row === "string" ? JSON.parse(row) : row;
    if (!parsed || typeof parsed !== "object") return null;
    const preview = parsed as {
      companyName?: string;
      role?: string;
      email?: string;
      expiresAt?: string;
      status?: string;
    };
    const status = preview.status;
    if (
      status !== "pending" &&
      status !== "accepted" &&
      status !== "expired" &&
      status !== "revoked"
    ) {
      return null;
    }
    const email = (preview.email ?? "").toLowerCase();
    let signedInEmail = claimEmail(context.claims);
    if (!signedInEmail) {
      const { data: userData } = await context.supabase.auth.getUser();
      signedInEmail = userData.user?.email?.trim().toLowerCase() ?? "";
    }
    return {
      companyName: preview.companyName || "Organisation",
      role: asRole(preview.role ?? ""),
      email,
      expiresAt: preview.expiresAt ?? "",
      status,
      emailMatches: signedInEmail === email && email.length > 0,
    };
  });

export const acceptCompanyInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { token: string }) => {
    const token = (input.token ?? "").trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(token)) throw new Error("This invitation link is not valid");
    return { token };
  })
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc(
      "accept_company_invitation" as never,
      {
        _token: data.token,
      } as never,
    );
    if (error) throw new Error(error.message);
    const result = (row ?? {}) as { companyId?: string; role?: string };
    return {
      companyId: result.companyId ?? "",
      role: asRole(result.role ?? ""),
    };
  });
