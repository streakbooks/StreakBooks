import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import type { CorrectionUndoSnapshot } from "./history-review";
import {
  correctionFilter,
  correctionInput,
  realDate,
  type CorrectionSetup,
  type CorrectionSearch,
  type CorrectionLine,
  type CorrectionPlan,
  type CorrectionBatch,
} from "./contracts";
const company = z.object({ companyId: z.string().uuid() });
export const getCorrectionSetup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => company.parse(input))
  .handler(async ({ data, context }) => {
    const { data: setup, error } = await context.supabase.rpc(
      "transaction_correction_setup" as never,
      { _company_id: data.companyId } as never,
    );
    if (error) throw new Error(error.message);
    const permission = await context.supabase.rpc("has_company_permission", {
      _company_id: data.companyId,
      _permission: "reports.export",
    });
    if (permission.error) throw new Error(permission.error.message);
    return {
      ...(setup as Omit<CorrectionSetup, "can_export">),
      can_export: Boolean(permission.data),
    };
  });
export const findCorrectionLines = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => company.extend({ filters: correctionFilter }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc(
      "find_correction_lines" as never,
      { _company_id: data.companyId, _filters: data.filters } as never,
    );
    if (error) throw new Error(error.message);
    const found = rows as Omit<CorrectionSearch, "rows"> & {
      rows: Array<Omit<CorrectionLine, "currency_decimals">>;
    };
    if (!found.rows.length) return { ...found, rows: [] as CorrectionLine[] };
    const { data: currencies, error: currencyError } = await context.supabase
      .from("currency_decimals" as never)
      .select("code, decimal_places" as never)
      .in("code" as never, [...new Set(found.rows.map((row) => row.currency))] as never);
    if (currencyError) throw new Error(currencyError.message);
    const precision = new Map(
      ((currencies ?? []) as Array<{ code: string; decimal_places: number }>).map((row) => [
        row.code,
        row.decimal_places,
      ]),
    );
    return {
      ...found,
      rows: found.rows.map((row) => {
        const decimals = precision.get(row.currency);
        if (decimals === undefined)
          throw new Error(`Currency precision is unavailable for ${row.currency}`);
        return { ...row, currency_decimals: decimals };
      }),
    };
  });
function params(data: z.infer<typeof correctionInput>) {
  return {
    _company_id: data.companyId,
    _items: data.items,
    _target_id: data.targetId,
    _mode: data.mode,
    _date: data.date,
    _reason: data.reason,
  };
}
export const previewCorrection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => correctionInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: plan, error } = await context.supabase.rpc(
      "preview_transaction_correction" as never,
      params(data) as never,
    );
    if (error) throw new Error(error.message);
    return plan as CorrectionPlan;
  });
export const applyCorrection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const raw = z
      .object({
        requestKey: z.string().uuid(),
        previewHash: z.string().regex(/^[a-f0-9]{32}$/),
        input: correctionInput,
      })
      .parse(input);
    return raw;
  })
  .handler(async ({ data, context }) => {
    const { data: batch, error } = await context.supabase.rpc(
      "apply_transaction_correction" as never,
      {
        ...params(data.input),
        _request_key: data.requestKey,
        _preview_hash: data.previewHash,
      } as never,
    );
    if (error) throw new Error(error.message);
    return batch as CorrectionBatch;
  });
export const undoCorrection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    company
      .extend({
        batchId: z.string().uuid(),
        date: realDate,
        reason: z.string().trim().min(5).max(1000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: batch, error } = await context.supabase.rpc(
      "undo_transaction_correction" as never,
      {
        _company_id: data.companyId,
        _batch_id: data.batchId,
        _date: data.date,
        _reason: data.reason,
      } as never,
    );
    if (error) throw new Error(error.message);
    return batch as CorrectionBatch;
  });
/**
 * A read-after-review snapshot for Undo. The underlying RPC remains the final
 * authority for concurrent postings, permissions, locks and idempotency.
 */
export const getCorrectionUndoSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    company.extend({ batchId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<CorrectionUndoSnapshot> => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounting.view");
    const { data: batch, error } = await context.supabase
      .from("transaction_correction_batches" as never)
      .select("id,company_id,request_key,status,created_at,plan,journal_ids" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("id" as never, data.batchId as never)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!batch) throw new Error("Correction batch not found. Refresh correction history.");
    return batch as CorrectionUndoSnapshot;
  });

export const listCorrectionHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    company.extend({ page: z.number().int().min(0).max(100000).default(0) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounting.view");
    const { data: rows, error } = await context.supabase
      .from("transaction_correction_batches" as never)
      .select(
        "id,company_id,request_key,reason,date_mode,adjustment_date,plan,journal_ids,status,created_by,created_at,undo_date,undo_reason,undone_by,undone_at,undo_journal_ids" as never,
      )
      .eq("company_id" as never, data.companyId as never)
      .order("created_at" as never, { ascending: false })
      .order("id" as never)
      .range(data.page * 50, data.page * 50 + 50);
    if (error) throw new Error(error.message);
    return {
      rows: ((rows ?? []) as CorrectionBatch[]).slice(0, 50),
      has_more: (rows ?? []).length > 50,
      page: data.page,
    };
  });
