import { isoDate } from "./practice-work";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;

async function countEq(
  supabase: Client,
  table: string,
  companyId: string,
  column: string,
  value: string,
  dateColumn: string,
  asOf: string,
): Promise<number> {
  const { count, error } = await supabase
    .from(table as never)
    .select("id" as never, { count: "exact", head: true })
    .eq("company_id" as never, companyId as never)
    .eq(column as never, value as never)
    .lte(dateColumn as never, asOf as never);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function countNeq(
  supabase: Client,
  table: string,
  companyId: string,
  column: string,
  value: string,
  dateColumn: string,
  asOf: string,
): Promise<number> {
  const { count, error } = await supabase
    .from(table as never)
    .select("id" as never, { count: "exact", head: true })
    .eq("company_id" as never, companyId as never)
    .neq(column as never, value as never)
    .lte(dateColumn as never, asOf as never);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export const getAccountantChecklist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; asOf?: string }) => ({
    companyId: assertUuid(input.companyId),
    asOf: isoDate.parse(input.asOf ?? new Date().toISOString().slice(0, 10)),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounting.view");
    const supabase = context.supabase;
    const cid = data.companyId;

    const [
      unlockedPeriods,
      draftInvoices,
      draftBills,
      awaitingBills,
      uncategorisedBank,
      matchedBank,
      openRecon,
    ] = await Promise.all([
      countNeq(supabase, "accounting_periods", cid, "status", "locked", "start_date", data.asOf),
      countEq(supabase, "sales_invoices", cid, "status", "draft", "invoice_date", data.asOf),
      countEq(supabase, "purchase_bills", cid, "status", "draft", "bill_date", data.asOf),
      countEq(
        supabase,
        "purchase_bills",
        cid,
        "status",
        "awaiting_approval",
        "bill_date",
        data.asOf,
      ),
      countEq(supabase, "bank_transactions", cid, "status", "uncategorised", "txn_date", data.asOf),
      countEq(supabase, "bank_transactions", cid, "status", "matched", "txn_date", data.asOf),
      countEq(
        supabase,
        "reconciliation_sessions",
        cid,
        "status",
        "open",
        "statement_date",
        data.asOf,
      ),
    ]);

    const { data: recentJournals, error: jErr } = await supabase
      .from("journals" as never)
      .select("id, journal_number, journal_date, status, source_type, memo" as never)
      .eq("company_id" as never, cid as never)
      .lte("journal_date" as never, data.asOf as never)
      .order("created_at" as never, { ascending: false })
      .limit(15);
    if (jErr) throw new Error(jErr.message);

    return {
      unlockedPeriods,
      draftInvoices,
      draftBills: draftBills + awaitingBills,
      uncategorisedBank,
      matchedAwaitingReconcile: matchedBank,
      openReconciliationSessions: openRecon,
      recentJournals: recentJournals ?? [],
      links: {
        periods: "/accounting",
        invoices: "/sales/invoices",
        bills: "/purchases/bills",
        banking: "/banking/transactions",
        reconcile: "/banking/reconcile",
        journals: "/accounting",
        reports: "/reports",
      },
    };
  });
