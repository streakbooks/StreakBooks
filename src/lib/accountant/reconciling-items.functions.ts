import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";

const uuid = z.string().uuid();
const minor = z
  .string()
  .regex(/^-?[0-9]+$/)
  .refine((value) => {
    const amount = BigInt(value);
    return (
      amount !== 0n &&
      amount <= BigInt(Number.MAX_SAFE_INTEGER) &&
      amount >= -BigInt(Number.MAX_SAFE_INTEGER)
    );
  }, "Enter a nonzero amount within the safe minor-unit range.");

export type WorkpaperReconcilingItem = {
  id: string;
  company_id: string;
  workpaper_id: string;
  description: string;
  amount_minor: number;
  evidence_reference: string;
  state: "open" | "resolved";
  resolution_note: string;
  resolved_by: string | null;
  resolved_at: string | null;
  updated_at: string;
  version: number;
};
export type WorkpaperItemEvent = {
  id: string;
  action: "add" | "update" | "resolve" | "reopen";
  reason: string;
  actor_id: string;
  created_at: string;
};

const listInput = z.object({ companyId: uuid, workpaperId: uuid });
const eventInput = z.object({ companyId: uuid, workpaperId: uuid, itemId: uuid });
const saveInput = z.object({
  companyId: uuid,
  workpaperId: uuid,
  payload: z
    .object({
      action: z.enum(["add", "update", "resolve", "reopen"]),
      id: uuid.optional(),
      version: z.number().int().positive().optional(),
      description: z.string().trim().min(3).max(500).optional(),
      amountMinor: minor.optional(),
      evidenceReference: z.string().max(300).optional(),
      reason: z.string().trim().max(2000).optional(),
    })
    .strict()
    .superRefine((data, context) => {
      if (data.action === "add" && (data.id || data.version)) {
        context.addIssue({
          code: "custom",
          message: "A new item cannot contain a saved identity.",
        });
      }
      if (data.action !== "add" && (!data.id || !data.version)) {
        context.addIssue({ code: "custom", message: "Refresh the item before changing it." });
      }
      if (
        (data.action === "add" || data.action === "update") &&
        (!data.description || !data.amountMinor)
      ) {
        context.addIssue({
          code: "custom",
          message: "A description and exact amount are required.",
        });
      }
      if (
        (data.action === "resolve" || data.action === "reopen") &&
        (!data.reason || data.reason.length < 3)
      ) {
        context.addIssue({
          code: "custom",
          message: "A resolution or reopening reason is required.",
        });
      }
    }),
});

export const listWorkpaperReconcilingItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listInput.parse(input))
  .handler(async ({ data, context }): Promise<WorkpaperReconcilingItem[]> => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounting.view");
    const { data: rows, error } = await context.supabase
      .from("account_workpaper_reconciling_items" as never)
      .select(
        "id,company_id,workpaper_id,description,amount_minor,evidence_reference,state,resolution_note,resolved_by,resolved_at,updated_at,version" as never,
      )
      .eq("company_id" as never, data.companyId as never)
      .eq("workpaper_id" as never, data.workpaperId as never)
      .order("created_at" as never);
    if (error) throw new Error(error.message);
    return (rows ?? []) as WorkpaperReconcilingItem[];
  });

export const listWorkpaperItemEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => eventInput.parse(input))
  .handler(async ({ data, context }): Promise<WorkpaperItemEvent[]> => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounting.view");
    const { data: rows, error } = await context.supabase
      .from("account_workpaper_reconciling_item_events" as never)
      .select("id,action,reason,actor_id,created_at" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("workpaper_id" as never, data.workpaperId as never)
      .eq("item_id" as never, data.itemId as never)
      .order("created_at" as never, { ascending: false } as never)
      .limit(100);
    if (error) throw new Error(error.message);
    return (rows ?? []) as WorkpaperItemEvent[];
  });

export const saveWorkpaperReconcilingItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveInput.parse(input))
  .handler(async ({ data, context }): Promise<{ id: string; state: string; version: number }> => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounting.post");
    const { data: row, error } = await context.supabase.rpc(
      "save_account_workpaper_reconciling_item" as never,
      {
        _company_id: data.companyId,
        _workpaper_id: data.workpaperId,
        _payload: data.payload,
      } as never,
    );
    if (error) throw new Error(error.message);
    return row as { id: string; state: string; version: number };
  });
