import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import { fetchAllPages, type PageResult } from "@/lib/accounting/fetch-all";
import { workflowRpc } from "@/lib/workflows-rpc.server";
import {
  cashPolicyInput,
  cashOpeningInput,
  cashInventoryInput,
  cashExceptionInput,
  cashResolveInput,
  type CashPolicyInput,
  type CashOpeningInput,
  type CashInventoryInput,
  type CashExceptionInput,
  type CashResolveInput,
} from "./cash-classification-contracts";

type Db = Parameters<typeof assertCompanyPermission>[0];
type Row = Record<string, unknown>;
export type CashPolicyRecord = z.output<typeof cashPolicyInput>["payload"] & {
  id: string;
  company_id: string;
  version: number;
  approved_by: string;
  approved_at: string;
};
export type CashOpeningRecord = z.output<typeof cashOpeningInput>["payload"] & {
  id: string;
  company_id: string;
  version: number;
  approved_by: string;
  approved_at: string;
};
export type CashInventoryRecord = z.output<typeof cashInventoryInput>["payload"] & {
  id: string;
  company_id: string;
  version: number;
  approved_by: string;
  approved_at: string;
};
export type CashExceptionRecord = {
  id: string;
  code: string;
  source_account_id: string | null;
  journal_id: string | null;
  document_id: string | null;
  document_kind: string | null;
  amount_minor: string;
  currency_code: string;
  period_from: string;
  period_to: string;
  missing_information: string;
  status: "open" | "resolved";
  resolution_kind: "policy" | "opening" | "inventory" | null;
  resolution_id: string | null;
  created_at: string;
  resolved_at: string | null;
};
export type CashClassificationAudit = {
  id: string;
  entity_kind: string;
  entity_id: string;
  action: string;
  actor_id: string;
  occurred_at: string;
  details: string;
};
export async function assertCashClassificationView(db: Db, companyId: string) {
  const results = await Promise.all(
    ["reports.view", "accounting.view"].map((permission) =>
      db.rpc("has_company_permission", { _company_id: companyId, _permission: permission }),
    ),
  );
  for (const result of results) if (result.error) throw new Error(result.error.message);
  if (!results.some((result) => result.data))
    throw new Error(
      "You do not have permission to review cash classifications for this organisation.",
    );
}

const companyInput = (input: { companyId: string }) => ({
  companyId: assertUuid(input?.companyId),
});
/** Read-only: generating a report never creates or approves classifications. */
export const listCashClassifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(companyInput)
  .handler(async ({ data, context }) => {
    await assertCashClassificationView(context.supabase, data.companyId);
    const read = <T>(table: string, columns: string) =>
      fetchAllPages<T>(
        (from, to) =>
          context.supabase
            .from(table as never)
            .select(columns as never)
            .eq("company_id" as never, data.companyId as never)
            .order("id" as never)
            .range(from, to) as unknown as PromiseLike<PageResult<T>>,
      );
    const [policies, opening, inventory, exceptions, audit] = await Promise.all([
      read<CashPolicyRecord>("cash_classification_policies", "*"),
      read<CashOpeningRecord>("cash_opening_evidence", "*,gross_minor::text"),
      read<CashInventoryRecord>("cash_inventory_evidence", "*,cost_minor::text"),
      read<CashExceptionRecord>("cash_classification_exceptions", "*,amount_minor::text"),
      read<CashClassificationAudit>("cash_classification_audit", "*"),
    ]);
    return {
      policies,
      opening,
      inventory,
      exceptions,
      audit: audit.map((row) => ({
        ...row,
        details:
          typeof row.details === "string" ? row.details : (JSON.stringify(row.details) ?? "{}"),
      })),
    };
  });

export const approveCashPolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: CashPolicyInput) => cashPolicyInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounting.post");
    return workflowRpc<string>(context.supabase, "approve_cash_classification_policy", {
      _company_id: data.companyId,
      _payload: data.payload,
    });
  });
export const approveCashOpening = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: CashOpeningInput) => cashOpeningInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounting.post");
    return workflowRpc<string>(context.supabase, "approve_cash_opening_evidence", {
      _company_id: data.companyId,
      _payload: data.payload,
    });
  });
export const approveCashInventory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: CashInventoryInput) => cashInventoryInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounting.post");
    return workflowRpc<string>(context.supabase, "approve_cash_inventory_evidence", {
      _company_id: data.companyId,
      _payload: data.payload,
    });
  });
export const recordCashClassificationException = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: CashExceptionInput) => cashExceptionInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertCashClassificationView(context.supabase, data.companyId);
    const e = data.exception;
    const key = [
      e.code,
      e.sourceAccountId,
      e.journalId,
      e.documentId,
      e.date,
      e.amountMinor,
      e.currency,
      e.period.from,
      e.period.to,
    ].join("|");
    return workflowRpc<string>(context.supabase, "record_cash_classification_exception", {
      _company_id: data.companyId,
      _payload: {
        exception_key: key,
        code: e.code,
        source_account_id: e.sourceAccountId,
        journal_id: e.journalId,
        document_id: e.documentId,
        document_kind: null,
        source_date: e.date,
        amount_minor: e.amountMinor,
        currency_code: e.currency,
        period_from: e.period.from,
        period_to: e.period.to,
        missing_information: `${e.message}\n${e.missingEvidence.join("\n")}`,
      },
    });
  });
export const resolveCashClassificationException = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: CashResolveInput) => cashResolveInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounting.post");
    return workflowRpc<string>(context.supabase, "resolve_cash_classification_exception", {
      _company_id: data.companyId,
      _exception_id: data.exceptionId,
      _resolution_kind: data.resolutionKind,
      _resolution_id: data.resolutionId,
      _review_note: data.reviewNote,
    });
  });

export type CashSourceDocument = {
  id: string;
  sourceKind: "sales_invoice" | "purchase_bill";
  label: string;
  date: string;
  currency: string;
  grossMinor: string;
  postedJournalId: string;
  journal: {
    id: string;
    journal_number: number;
    journal_date: string;
    source_type: string;
    currency_code: string;
  };
};
const sourceInput = z.object({
  companyId: z.string().transform((v) => assertUuid(v)),
  sourceKind: z.enum(["sales_invoice", "purchase_bill"]),
  openingOnly: z.boolean(),
  search: z.string().trim().max(80).default(""),
  documentId: z
    .string()
    .transform((v) => assertUuid(v, "document"))
    .optional(),
  page: z.number().int().min(0).max(100000).default(0),
});
/** Uses the document's authoritative journal link; never guesses using a reference or account name. */
export const listCashClassificationDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.input<typeof sourceInput>) => sourceInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertCashClassificationView(context.supabase, data.companyId);
    const sale = data.sourceKind === "sales_invoice";
    const number = sale ? "invoice_number" : "bill_number";
    const date = sale ? "invoice_date" : "bill_date";
    let query = context.supabase
      .from((sale ? "sales_invoices" : "purchase_bills") as never)
      .select(
        `id,${number},${date},currency_code,total_minor::text,posted_journal_id,posted_journal:journals!posted_journal_id!inner(id,journal_number,journal_date,source_type,currency_code)` as never,
        { count: "exact" },
      )
      .eq("company_id" as never, data.companyId as never)
      .eq("posted_journal.company_id" as never, data.companyId as never)
      .eq("posted_journal.status" as never, "posted" as never)
      .neq("status" as never, "void" as never);
    if (data.openingOnly)
      query = query.eq("posted_journal.source_type" as never, "opening_balance" as never);
    if (data.documentId) query = query.eq("id" as never, data.documentId as never);
    if (data.search)
      query = query.ilike(number as never, `%${data.search.replace(/[%_]/g, "")}%` as never);
    const {
      data: rows,
      count,
      error,
    } = await query.order("id" as never).range(data.page * 50, data.page * 50 + 49);
    if (error) throw new Error(error.message);
    return {
      total: count ?? 0,
      rows: ((rows ?? []) as unknown as Row[]).map((row): CashSourceDocument => ({
        id: String(row["id"]),
        sourceKind: data.sourceKind,
        label: String(row[number] ?? row["id"]),
        date: String(row[date]),
        currency: String(row["currency_code"]),
        grossMinor: String(row["total_minor"]),
        postedJournalId: String(row["posted_journal_id"]),
        journal: row["posted_journal"] as CashSourceDocument["journal"],
      })),
    };
  });

export const getCashInventoryTrace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; from: string; to: string }) =>
    z
      .object({
        companyId: z.string().uuid(),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "reports.view");
    const { loadCashReportInput } = await import("@/lib/reports/cash-report.server");
    const { cashLedger } = await import("@/lib/reports/cash-ledger");
    const { traceCashInventory } = await import("@/lib/reports/cash-inventory");
    const { loadCompanyMeta } = await import("@/lib/accounting/ledger-data");
    const input = await loadCashReportInput(context.supabase, data.companyId, data.to);
    const meta = await loadCompanyMeta(context.supabase, data.companyId);
    const accounts = [
      ...new Set(
        (input.classificationPolicies ?? [])
          .filter((p) => p.kind === "inventory" && p.status === "approved")
          .map((p) => p.sourceAccountId),
      ),
    ];
    return {
      companyName: meta.name,
      trace: traceCashInventory(
        input,
        cashLedger(input, { from: "0001-01-01", to: data.to }),
        data,
        accounts,
      ),
    };
  });
