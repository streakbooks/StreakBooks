import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { correctionInput, type CorrectionInput, type CorrectionPlan } from "./contracts";

const company = z.object({ companyId: z.string().uuid() });
const approvalStatus = z.enum(["pending", "approved", "rejected", "posted"]);

export type CorrectionApprovalSettings = {
  required: boolean;
  user_id: string;
  can_approve: boolean;
  can_configure: boolean;
};

export type CorrectionApprovalRequest = {
  id: string;
  company_id: string;
  request_key: string;
  request_hash: string;
  preview_hash: string;
  input: CorrectionInput;
  plan: Omit<CorrectionPlan, "preview_hash">;
  status: z.infer<typeof approvalStatus>;
  submitted_by: string;
  submitted_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  posted_by: string | null;
  posted_at: string | null;
  posted_batch_id: string | null;
  version: number;
};

export type CorrectionApprovalEvent = {
  id: string;
  approval_id: string;
  actor_id: string;
  action: "submit" | "approve" | "reject" | "post";
  from_status: string | null;
  to_status: string;
  note: string;
  created_at: string;
  version: number;
};

export const getCorrectionApprovalSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => company.parse(input))
  .handler(async ({ data, context }) => {
    const { data: settings, error } = await context.supabase.rpc(
      "get_correction_approval_settings" as never,
      { _company_id: data.companyId } as never,
    );
    if (error) throw new Error(error.message);
    return settings as CorrectionApprovalSettings;
  });

export const listCorrectionApprovalRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    company.extend({ page: z.number().int().min(0).max(100000).default(0) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounting.view");
    const { data: approvals, error } = await context.supabase
      .from("correction_approval_requests" as never)
      .select(
        "id,company_id,request_key,request_hash,preview_hash,input,plan,status,submitted_by,submitted_at,decided_by,decided_at,decision_note,posted_by,posted_at,posted_batch_id,version" as never,
      )
      .eq("company_id" as never, data.companyId as never)
      .order("submitted_at" as never, { ascending: false })
      .order("id" as never, { ascending: false })
      .range(data.page * 50, data.page * 50 + 50);
    if (error) throw new Error(error.message);
    const records = (approvals ?? []) as CorrectionApprovalRequest[];
    return {
      rows: records.slice(0, 50),
      page: data.page,
      has_more: records.length > 50,
    };
  });

export const listCorrectionApprovalEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    company.extend({ approvalId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounting.view");
    const { data: records, error } = await context.supabase
      .from("correction_approval_events" as never)
      .select("id,approval_id,actor_id,action,from_status,to_status,note,created_at,version" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("approval_id" as never, data.approvalId as never)
      .order("created_at" as never, { ascending: true })
      .order("id" as never, { ascending: true })
      .limit(100);
    if (error) throw new Error(error.message);
    return (records ?? []) as CorrectionApprovalEvent[];
  });

export const submitCorrectionApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        input: correctionInput,
        requestKey: z.string().uuid(),
        previewHash: z.string().regex(/^[a-f0-9]{32}$/),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: work, error } = await context.supabase.rpc(
      "submit_correction_for_approval" as never,
      {
        _company_id: data.input.companyId,
        _request_key: data.requestKey,
        _preview_hash: data.previewHash,
        _items: data.input.items,
        _target_id: data.input.targetId,
        _mode: data.input.mode,
        _date: data.input.date,
        _reason: data.input.reason,
      } as never,
    );
    if (error) throw new Error(error.message);
    return work as CorrectionApprovalRequest;
  });

export const decideCorrectionApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    company
      .extend({
        approvalId: z.string().uuid(),
        approve: z.boolean(),
        note: z.string().trim().min(5).max(1000),
        expectedVersion: z.number().int().positive(),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: work, error } = await context.supabase.rpc(
      "decide_correction_approval" as never,
      {
        _company_id: data.companyId,
        _approval_id: data.approvalId,
        _approve: data.approve,
        _note: data.note,
        _expected_version: data.expectedVersion,
      } as never,
    );
    if (error) throw new Error(error.message);
    return work as CorrectionApprovalRequest;
  });

export const setCorrectionApprovalPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    company.extend({ required: z.boolean() }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc(
      "set_correction_approval_policy" as never,
      { _company_id: data.companyId, _required: data.required } as never,
    );
    if (error) throw new Error(error.message);
    return result as { required: boolean };
  });
