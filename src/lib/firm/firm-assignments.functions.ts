import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { isoDate } from "@/lib/accountant/practice-work";

type Db = Parameters<typeof assertCompanyPermission>[0];

export const firmScope = z
  .object({ firmId: z.string().uuid(), companyId: z.string().uuid() })
  .strict();

export async function assertFirmScope(
  db: Db,
  userId: string,
  firmId: string,
  companyId: string,
  admin: boolean,
): Promise<void> {
  const { data: membership, error: memberError } = await db
    .from("firm_members" as never)
    .select("role" as never)
    .eq("firm_id" as never, firmId as never)
    .eq("user_id" as never, userId as never)
    .maybeSingle();
  if (memberError) throw new Error(memberError.message);
  if (!membership) throw new Error("Firm membership required");
  if (admin && !["owner", "admin"].includes((membership as { role: string }).role))
    throw new Error("Firm administrator access required");

  const { data: link, error: linkError } = await db
    .from("firm_client_links" as never)
    .select("id" as never)
    .eq("firm_id" as never, firmId as never)
    .eq("company_id" as never, companyId as never)
    .is("revoked_at" as never, null)
    .maybeSingle();
  if (linkError) throw new Error(linkError.message);
  if (!link) throw new Error("Active firm-client link required");
  await assertCompanyPermission(db, companyId, "accounting.view");
}

export const RESPONSIBILITIES = ["lead", "manager", "bookkeeper", "reviewer"] as const;
export type FirmAssignment = {
  firm_id: string;
  company_id: string;
  user_id: string;
  responsibility: (typeof RESPONSIBILITIES)[number];
  updated_at: string;
};

export const listAssignableFirmMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => firmScope.parse(input))
  .handler(async ({ data, context }) => {
    await assertFirmScope(context.supabase, context.userId, data.firmId, data.companyId, false);
    const sb = context.supabase;
    const [members, firmMembers] = await Promise.all([
      sb
        .from("company_members" as never)
        .select("user_id,status" as never)
        .eq("company_id" as never, data.companyId as never)
        .eq("status" as never, "active" as never)
        .limit(201),
      sb
        .from("firm_members" as never)
        .select("user_id" as never)
        .eq("firm_id" as never, data.firmId as never)
        .limit(201),
    ]);
    if (members.error || firmMembers.error)
      throw new Error(members.error?.message ?? firmMembers.error?.message);
    if ((members.data ?? []).length > 200 || (firmMembers.data ?? []).length > 200)
      throw new Error("Too many client/firm members for this page");
    const permitted = new Set(
      (firmMembers.data ?? []).map((item) => (item as { user_id: string }).user_id),
    );
    const rows = (members.data ?? [])
      .map((item) => item as { user_id: string })
      .filter((item) => permitted.has(item.user_id));
    if (!rows.length)
      return [] as Array<{ user_id: string; full_name: string | null; email: string | null }>;
    const { data: people, error } = await sb
      .from("profiles")
      .select("id,full_name,email")
      .in(
        "id",
        rows.map((r) => r.user_id),
      );
    if (error) throw new Error(error.message);
    const map = new Map((people ?? []).map((p) => [p.id, p]));
    return rows.map((row) => ({
      user_id: row.user_id,
      full_name: map.get(row.user_id)?.full_name ?? null,
      email: map.get(row.user_id)?.email ?? null,
    }));
  });

export const listFirmClientAssignments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => firmScope.parse(input))
  .handler(async ({ data, context }): Promise<FirmAssignment[]> => {
    await assertFirmScope(context.supabase, context.userId, data.firmId, data.companyId, false);
    const { data: rows, error } = await context.supabase
      .from("firm_client_assignments" as never)
      .select("firm_id,company_id,user_id,responsibility,updated_at" as never)
      .eq("firm_id" as never, data.firmId as never)
      .eq("company_id" as never, data.companyId as never)
      .order("created_at" as never)
      .limit(201);
    if (error) throw new Error(error.message);
    if ((rows ?? []).length > 200) throw new Error("Client assignment limit exceeded");
    return (rows ?? []) as FirmAssignment[];
  });

export const saveFirmAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    firmScope
      .extend({
        userId: z.string().uuid(),
        responsibility: z.enum(RESPONSIBILITIES),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    await assertFirmScope(sb, context.userId, data.firmId, data.companyId, true);
    const { data: result, error } = await sb
      .from("firm_client_assignments" as never)
      .upsert(
        {
          firm_id: data.firmId,
          company_id: data.companyId,
          user_id: data.userId,
          responsibility: data.responsibility,
          updated_by: context.userId,
        } as never,
        { onConflict: "firm_id,company_id,user_id" },
      )
      .select("user_id,responsibility" as never)
      .single();
    if (error) throw new Error(error.message);
    return result as { user_id: string; responsibility: string };
  });

export const removeFirmAssignment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => firmScope.extend({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    await assertFirmScope(sb, context.userId, data.firmId, data.companyId, true);
    const { data: removed, error } = await sb
      .from("firm_client_assignments" as never)
      .delete()
      .eq("firm_id" as never, data.firmId as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("user_id" as never, data.userId as never)
      .select("user_id" as never);
    if (error) throw new Error(error.message);
    if ((removed ?? []).length !== 1) throw new Error("Assignment missing or permission denied");
    return { removed: true };
  });

// Allow firm admins to add an EXISTING account which is already an active member of
// one linked company. This deliberately does not email invitations or grant company access.
export const addExistingFirmColleague = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => firmScope.extend({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    await assertFirmScope(sb, context.userId, data.firmId, data.companyId, true);
    const { data: member, error: memberError } = await sb
      .from("company_members" as never)
      .select("user_id" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("user_id" as never, data.userId as never)
      .eq("status" as never, "active" as never)
      .maybeSingle();
    if (memberError) throw new Error(memberError.message);
    if (!member)
      throw new Error("This user must already be an active colleague of this client company");
    const { error } = await sb.from("firm_members" as never).upsert(
      {
        firm_id: data.firmId,
        user_id: data.userId,
        role: "member",
      } as never,
      { onConflict: "firm_id,user_id", ignoreDuplicates: true },
    );
    if (error) throw new Error(error.message);
    return { added: true, companyAccessUnchanged: true };
  });

export const listCandidateFirmColleagues = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => firmScope.parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    await assertFirmScope(sb, context.userId, data.firmId, data.companyId, true);
    const [company, firm] = await Promise.all([
      sb
        .from("company_members" as never)
        .select("user_id" as never)
        .eq("company_id" as never, data.companyId as never)
        .eq("status" as never, "active" as never)
        .limit(201),
      sb
        .from("firm_members" as never)
        .select("user_id" as never)
        .eq("firm_id" as never, data.firmId as never)
        .limit(201),
    ]);
    if (company.error || firm.error) throw new Error(company.error?.message ?? firm.error?.message);
    if ((company.data ?? []).length > 200 || (firm.data ?? []).length > 200)
      throw new Error("Team directory exceeds 200 records");
    const known = new Set((firm.data ?? []).map((v) => (v as { user_id: string }).user_id));
    const candidates = (company.data ?? [])
      .map((v) => (v as { user_id: string }).user_id)
      .filter((userId) => !known.has(userId));
    if (!candidates.length)
      return [] as Array<{ user_id: string; full_name: string | null; email: string | null }>;
    const { data: profiles, error } = await sb
      .from("profiles")
      .select("id,full_name,email")
      .in("id", candidates);
    if (error) throw new Error(error.message);
    return (profiles ?? []).map((x) => ({ user_id: x.id, full_name: x.full_name, email: x.email }));
  });

export const listFirmAssignmentsAcrossClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ firmId: z.string().uuid() }).strict().parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: member, error } = await sb
      .from("firm_members" as never)
      .select("id" as never)
      .eq("firm_id" as never, data.firmId as never)
      .eq("user_id" as never, context.userId as never)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!member) throw new Error("Firm membership required");
    // Company-level RLS suppresses assignments for independently inaccessible clients.
    const { data: rows, error: loadError } = await sb
      .from("firm_client_assignments" as never)
      .select("firm_id,company_id,user_id,responsibility,updated_at" as never)
      .eq("firm_id" as never, data.firmId as never)
      .order("company_id" as never)
      .limit(1001);
    if (loadError) throw new Error(loadError.message);
    if ((rows ?? []).length > 1000) throw new Error("Practice assignment portfolio exceeds 1,000");
    return (rows ?? []) as FirmAssignment[];
  });
