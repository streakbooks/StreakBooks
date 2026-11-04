import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { isoDate } from "@/lib/accountant/practice-work";

export const REQUEST_STATUSES = ["open", "waiting", "received", "reviewed", "cancelled"] as const;
export const REQUEST_PRIORITIES = ["low", "normal", "high"] as const;

export type FirmClientRequest = {
  id: string;
  firm_id: string;
  company_id: string;
  title: string;
  description: string;
  status: (typeof REQUEST_STATUSES)[number];
  priority: (typeof REQUEST_PRIORITIES)[number];
  due_date: string | null;
  assigned_to: string | null;
  last_note: string;
  version: number;
  created_at: string;
  updated_at: string;
};

const scope = z.object({ firmId: z.string().uuid(), companyId: z.string().uuid() }).strict();
export const requestInput = scope
  .extend({
    id: z.string().uuid().optional(),
    version: z.number().int().positive().optional(),
    title: z.string().trim().min(3).max(180),
    description: z.string().trim().max(3000),
    status: z.enum(REQUEST_STATUSES),
    priority: z.enum(REQUEST_PRIORITIES),
    due_date: isoDate.nullable(),
    assigned_to: z.string().uuid().nullable(),
    last_note: z.string().trim().max(1500),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.id && value.version === undefined) {
      ctx.addIssue({ code: "custom", message: "Refresh the request before editing" });
    }
    if (!value.id && value.version !== undefined) {
      ctx.addIssue({ code: "custom", message: "New requests must not carry a version" });
    }
  });
export type FirmClientRequestInput = z.infer<typeof requestInput>;

export function summarizeRequests(
  requests: Pick<FirmClientRequest, "status" | "due_date">[],
  today: string,
) {
  return {
    total: requests.length,
    unresolved: requests.filter((r) => r.status === "open" || r.status === "waiting").length,
    received: requests.filter((r) => r.status === "received").length,
    overdue: requests.filter(
      (r) =>
        r.due_date !== null &&
        r.due_date < today &&
        (r.status === "open" || r.status === "waiting"),
    ).length,
  };
}

async function checkFirmClient(
  context: { supabase: Parameters<typeof assertCompanyPermission>[0]; userId: string },
  firmId: string,
  companyId: string,
  canEdit: boolean,
) {
  const db = context.supabase;
  const { data: member, error } = await db
    .from("firm_members" as never)
    .select("role" as never)
    .eq("firm_id" as never, firmId as never)
    .eq("user_id" as never, context.userId as never)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!member) throw new Error("Firm membership required");
  if (canEdit && !["owner", "admin"].includes((member as { role: string }).role)) {
    throw new Error("Firm administrator access required");
  }
  const { data: link, error: linkError } = await db
    .from("firm_client_links" as never)
    .select("id" as never)
    .eq("firm_id" as never, firmId as never)
    .eq("company_id" as never, companyId as never)
    .is("revoked_at" as never, null)
    .maybeSingle();
  if (linkError) throw new Error(linkError.message);
  if (!link) throw new Error("The selected client is no longer linked to the firm");
  await assertCompanyPermission(db, companyId, "accounting.view");
}

const fields =
  "id,firm_id,company_id,title,description,status,priority,due_date,assigned_to,last_note,version,created_at,updated_at";

export const listFirmClientRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => scope.parse(input))
  .handler(async ({ data, context }): Promise<FirmClientRequest[]> => {
    await checkFirmClient(context, data.firmId, data.companyId, false);
    const { data: rows, error } = await context.supabase
      .from("firm_client_requests" as never)
      .select(fields as never)
      .eq("firm_id" as never, data.firmId as never)
      .eq("company_id" as never, data.companyId as never)
      .order("created_at" as never, { ascending: false })
      .limit(201);
    if (error) throw new Error(error.message);
    if ((rows ?? []).length > 200) {
      throw new Error("Client request limit reached. Archive workflow must be enabled before continuing.");
    }
    return (rows ?? []) as FirmClientRequest[];
  });

export const saveFirmClientRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => requestInput.parse(input))
  .handler(async ({ data, context }): Promise<FirmClientRequest> => {
    await checkFirmClient(context, data.firmId, data.companyId, true);
    if (data.assigned_to) {
      const { data: member, error } = await context.supabase
        .from("firm_members" as never)
        .select("id" as never)
        .eq("firm_id" as never, data.firmId as never)
        .eq("user_id" as never, data.assigned_to as never)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!member) throw new Error("Assignee must belong to this firm");
    }
    const { firmId, companyId, id, version, ...record } = data;
    if (!id) {
      const { data: created, error } = await context.supabase
        .from("firm_client_requests" as never)
        .insert({
          ...record,
          firm_id: firmId,
          company_id: companyId,
          created_by: context.userId,
          updated_by: context.userId,
        } as never)
        .select(fields as never)
        .single();
      if (error) throw new Error(error.message);
      return created as FirmClientRequest;
    }
    const { data: updated, error } = await context.supabase
      .from("firm_client_requests" as never)
      .update({ ...record, updated_by: context.userId } as never)
      .eq("firm_id" as never, firmId as never)
      .eq("company_id" as never, companyId as never)
      .eq("id" as never, id as never)
      .eq("version" as never, version! as never)
      .select(fields as never)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("Request changed or permission was revoked. Refresh before retrying.");
    return updated as FirmClientRequest;
  });
