import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertFirmScope, firmScope } from "@/lib/firm/firm-assignments.functions";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { isoDate } from "@/lib/accountant/practice-work";

export type TrackedDocumentRequest = {
  request_id: string;
  viewer_can_complete: boolean;
  viewer_can_cancel: boolean;
  due_date: string;
  created_at: string;
  action_document_requests: {
    subject: string;
    instructions: string;
    requested_by: string;
    requested_from: string;
    created_at: string;
    completed_at: string | null;
    cancelled_at: string | null;
    attachment_id: string | null;
  } | null;
};

export const listFirmTrackedRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => firmScope.parse(input))
  .handler(async ({ data, context }): Promise<TrackedDocumentRequest[]> => {
    await assertFirmScope(context.supabase, context.userId, data.firmId, data.companyId, false);
    // Existing document-request RLS restricts visibility to sender or recipient.
    const { data: rows, error } = await context.supabase
      .from("firm_document_request_tracking" as never)
      .select(
        "request_id,due_date,created_at,action_document_requests(subject,instructions,requested_by,requested_from,created_at,completed_at,cancelled_at,attachment_id)" as never,
      )
      .eq("firm_id" as never, data.firmId as never)
      .eq("company_id" as never, data.companyId as never)
      .order("created_at" as never, { ascending: false })
      .limit(201);
    if (error) throw new Error(error.message);
    if ((rows ?? []).length > 200)
      throw new Error("Document requests exceed 200; narrow your scope");
    return (
      (rows ?? []) as Omit<TrackedDocumentRequest, "viewer_can_complete" | "viewer_can_cancel">[]
    ).map((row) => ({
      ...row,
      viewer_can_complete: row.action_document_requests?.requested_from === context.userId,
      viewer_can_cancel: row.action_document_requests?.requested_by === context.userId,
    }));
  });

export const listFirmRequestRecipients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => firmScope.parse(input))
  .handler(async ({ data, context }) => {
    await assertFirmScope(context.supabase, context.userId, data.firmId, data.companyId, true);
    const sb = context.supabase;
    const { data: rows, error } = await sb
      .from("company_members" as never)
      .select("user_id,role" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("status" as never, "active" as never)
      .limit(201);
    if (error) throw new Error(error.message);
    if ((rows ?? []).length > 200) throw new Error("Client team exceeds 200 people");
    const members = (rows ?? []) as Array<{ user_id: string; role: string }>;
    const roles = [...new Set(members.map((m) => m.role))];
    if (!roles.length)
      return [] as Array<{ user_id: string; full_name: string | null; email: string | null }>;
    const { data: permissions, error: permsError } = await sb
      .from("role_permissions" as never)
      .select("role,permission" as never)
      .in("role" as never, roles as never)
      .in("permission" as never, ["sales.draft", "purchases.draft", "accounting.post"] as never);
    if (permsError) throw new Error(permsError.message);
    const validRoles = new Set(((permissions ?? []) as Array<{ role: string }>).map((p) => p.role));
    const recipients = members.filter(
      (m) => m.user_id !== context.userId && validRoles.has(m.role),
    );
    if (!recipients.length)
      return [] as Array<{ user_id: string; full_name: string | null; email: string | null }>;
    const { data: people, error: peopleError } = await sb
      .from("profiles")
      .select("id,full_name,email")
      .in(
        "id",
        recipients.map((r) => r.user_id),
      );
    if (peopleError) throw new Error(peopleError.message);
    const names = new Map((people ?? []).map((p) => [p.id, p]));
    return recipients.map((r) => ({
      user_id: r.user_id,
      full_name: names.get(r.user_id)?.full_name ?? null,
      email: names.get(r.user_id)?.email ?? null,
    }));
  });

export const createFirmTrackedRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    firmScope
      .extend({
        requestedFrom: z.string().uuid(),
        subject: z.string().trim().min(3).max(160),
        instructions: z.string().trim().max(2000),
        dueDate: isoDate,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertFirmScope(context.supabase, context.userId, data.firmId, data.companyId, true);
    // Atomic RPC delegates to the existing 50/day rate-limited document request engine.
    const { data: id, error } = await context.supabase.rpc(
      "create_firm_document_request" as never,
      {
        _firm_id: data.firmId,
        _company_id: data.companyId,
        _requested_from: data.requestedFrom,
        _subject: data.subject,
        _instructions: data.instructions,
        _due_date: data.dueDate,
      } as never,
    );
    if (error) throw new Error(error.message);
    return { requestId: String(id) };
  });

export const cancelFirmTrackedRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    firmScope.extend({ requestId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertFirmScope(context.supabase, context.userId, data.firmId, data.companyId, true);
    const { data: row, error: fetchError } = await context.supabase
      .from("firm_document_request_tracking" as never)
      .select("request_id" as never)
      .eq("request_id" as never, data.requestId as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("firm_id" as never, data.firmId as never)
      .maybeSingle();
    if (fetchError) throw new Error(fetchError.message);
    if (!row) throw new Error("Request not found or permission denied");
    // Underlying RPC confirms only the original sender can cancel.
    const { error } = await context.supabase.rpc(
      "cancel_action_document_request" as never,
      { _request_id: data.requestId } as never,
    );
    if (error) throw new Error(error.message);
    return { cancelled: true };
  });

export const listFirmEligibleAttachments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    firmScope.extend({ requestId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertFirmScope(context.supabase, context.userId, data.firmId, data.companyId, false);
    const sb = context.supabase;
    const { data: record, error: reqError } = await sb
      .from("firm_document_request_tracking" as never)
      .select("request_id,action_document_requests(requested_from,created_at)" as never)
      .eq("request_id" as never, data.requestId as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("firm_id" as never, data.firmId as never)
      .maybeSingle();
    if (reqError) throw new Error(reqError.message);
    const request = (
      record as {
        action_document_requests: { requested_from: string; created_at: string } | null;
      } | null
    )?.action_document_requests;
    if (!request || request.requested_from !== context.userId)
      throw new Error("Only the requested recipient may fulfil this request");
    const { data: files, error } = await sb
      .from("document_attachments" as never)
      .select("id,file_name,created_at" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("entity_type" as never, "company" as never)
      .eq("entity_id" as never, data.companyId as never)
      .eq("uploaded_by" as never, context.userId as never)
      .gte("created_at" as never, request.created_at as never)
      .order("created_at" as never, { ascending: false })
      .limit(101);
    if (error) throw new Error(error.message);
    if ((files ?? []).length > 100) throw new Error("More than 100 recent eligible documents");
    return (files ?? []) as Array<{ id: string; file_name: string; created_at: string }>;
  });

export const completeFirmTrackedRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    firmScope
      .extend({
        requestId: z.string().uuid(),
        attachmentId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertFirmScope(context.supabase, context.userId, data.firmId, data.companyId, false);
    const { data: record, error: readError } = await context.supabase
      .from("firm_document_request_tracking" as never)
      .select("request_id" as never)
      .eq("request_id" as never, data.requestId as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("firm_id" as never, data.firmId as never)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!record) throw new Error("Request not found");
    // Existing RPC checks upload provenance, company, date and recipient identity.
    const { error } = await context.supabase.rpc(
      "complete_action_document_request" as never,
      { _request_id: data.requestId, _attachment_id: data.attachmentId } as never,
    );
    if (error) throw new Error(error.message);
    return { completed: true };
  });

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
      throw new Error(
        "Client request limit reached. Archive workflow must be enabled before continuing.",
      );
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
    if (!updated)
      throw new Error("Request changed or permission was revoked. Refresh before retrying.");
    return updated as FirmClientRequest;
  });
