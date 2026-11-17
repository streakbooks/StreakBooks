/**
 * Accounts-payable reports built from dated events.
 *
 * getAgedPayablesAsAt replaces the current-counter Aged Payables path for the Reports centre:
 *  - outstanding at the as-at date is rebuilt from allocation dates (not today's paid amounts);
 *  - unapplied payments and supplier credits appear as negative lines;
 *  - amounts are never summed across currencies;
 *  - deleted allocations archived in cash_allocation_history are restored when still active at asOf.
 *
 * Original LinkBooks implementation; competitor products were used only as functional references.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import { fetchAllPages } from "@/lib/sales/fetch-all";
import { isReportDate } from "@/lib/reports/date-validation";
import { assertPayablesAsOfNotFuture } from "@/lib/reports/payables-integrity";
import { requireApControlAccount } from "@/lib/purchases/accounts";
import {
  buildAgedPayablesAsAt,
  type AsAtApAllocation,
  type AsAtBill,
  type AsAtPurchaseCredit,
  type AsAtSupplierPayment,
} from "@/lib/purchases/ap-asat";
import { loadCompanyDefaults } from "@/lib/sales/sales-common";
import type { SalesClient } from "@/lib/sales/rpc";

type Q = {
  eq(c: never, v: never): Q;
  in(c: never, v: never): Q;
  lte(c: never, v: never): Q;
  neq(c: never, v: never): Q;
  order(c: never, o?: never): Q;
  range(
    a: number,
    b: number,
  ): PromiseLike<{ data: unknown[] | null; error: { message: string; code?: string } | null }>;
};

async function pagedWithFallback<T>(
  supabase: SalesClient,
  table: string,
  rich: string,
  basic: string,
  filter: (q: Q) => Q,
): Promise<T[]> {
  const run = (cols: string) =>
    fetchAllPages<T>(
      (from, to) =>
        filter(supabase.from(table as never).select(cols as never) as unknown as Q)
          .order("id" as never)
          .range(from, to) as never,
    );
  try {
    return await run(rich);
  } catch (e) {
    if (e instanceof Error && /column .* does not exist/i.test(e.message)) return run(basic);
    throw e;
  }
}

function isoDay(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

type HistoryRow = {
  id: string;
  source_table: string;
  allocation_id: string;
  operation: string;
  source_row: Record<string, unknown>;
  recorded_at: string;
};

function historyAllocation(
  row: HistoryRow,
  kind: "payment" | "credit",
): (AsAtApAllocation & { paymentId?: string; creditNoteId?: string; allocationId: string }) | null {
  const src = row.source_row ?? {};
  const billId = typeof src["bill_id"] === "string" ? src["bill_id"] : null;
  const amountRaw = src["amount_minor"];
  const amountMinor =
    typeof amountRaw === "number"
      ? amountRaw
      : typeof amountRaw === "string"
        ? Number(amountRaw)
        : NaN;
  const allocatedOn =
    typeof src["allocated_on"] === "string" ? src["allocated_on"].slice(0, 10) : null;
  if (!billId || !Number.isFinite(amountMinor) || amountMinor <= 0) return null;
  const reversedOn = isoDay(row.recorded_at);
  if (kind === "payment") {
    const paymentId = typeof src["payment_id"] === "string" ? src["payment_id"] : null;
    if (!paymentId) return null;
    return {
      allocationId: row.allocation_id,
      paymentId,
      billId,
      amountMinor,
      effectiveDate: allocatedOn ?? "0000-01-01",
      reversedOn,
    };
  }
  const creditNoteId =
    typeof src["credit_note_id"] === "string" ? src["credit_note_id"] : null;
  if (!creditNoteId) return null;
  return {
    allocationId: row.allocation_id,
    creditNoteId,
    billId,
    amountMinor,
    effectiveDate: allocatedOn ?? "0000-01-01",
    reversedOn,
  };
}

export async function loadApAsAtInputs(supabase: SalesClient, companyId: string, asOf: string) {
  const billsRaw = await pagedWithFallback<{
    id: string;
    contact_id: string;
    bill_number: string | null;
    supplier_invoice_number: string | null;
    currency_code: string;
    bill_date: string;
    due_date: string;
    total_minor: number;
    status: string;
    void_journal_id: string | null;
    contacts: { name: string } | null;
    journals: { journal_date: string } | null;
  }>(
    supabase,
    "purchase_bills",
    "id, contact_id, bill_number, supplier_invoice_number, currency_code, bill_date, due_date, total_minor, status, void_journal_id, contacts(name), journals:void_journal_id(journal_date)",
    "id, contact_id, bill_number, supplier_invoice_number, currency_code, bill_date, due_date, total_minor, status, void_journal_id, contacts(name)",
    (q) =>
      q
        .eq("company_id" as never, companyId as never)
        .neq("status" as never, "draft" as never)
        .lte("bill_date" as never, asOf as never),
  );

  const payments = await pagedWithFallback<{
    id: string;
    contact_id: string;
    reference: string | null;
    currency_code: string;
    payment_date: string;
    amount_minor: number;
    unallocated_minor: number;
    status: string;
    void_journal_id?: string | null;
    contacts: { name: string } | null;
    journals: { journal_date: string } | null;
  }>(
    supabase,
    "supplier_payments",
    "id, contact_id, reference, currency_code, payment_date, amount_minor, unallocated_minor, status, void_journal_id, contacts(name), journals:void_journal_id(journal_date)",
    "id, contact_id, reference, currency_code, payment_date, amount_minor, unallocated_minor, status, contacts(name)",
    (q) =>
      q.eq("company_id" as never, companyId as never).lte("payment_date" as never, asOf as never),
  );

  const credits = await pagedWithFallback<{
    id: string;
    contact_id: string;
    credit_number: string | null;
    currency_code: string;
    credit_date: string;
    total_minor: number;
    amount_allocated_minor: number;
    status: string;
    void_journal_id?: string | null;
    contacts: { name: string } | null;
    journals: { journal_date: string } | null;
  }>(
    supabase,
    "purchase_credit_notes",
    "id, contact_id, credit_number, currency_code, credit_date, total_minor, amount_allocated_minor, status, void_journal_id, contacts(name), journals:void_journal_id(journal_date)",
    "id, contact_id, credit_number, currency_code, credit_date, total_minor, amount_allocated_minor, status, contacts(name)",
    (q) =>
      q
        .eq("company_id" as never, companyId as never)
        .neq("status" as never, "draft" as never)
        .lte("credit_date" as never, asOf as never),
  );

  const paymentDate = new Map(payments.map((p) => [p.id, p.payment_date]));
  const creditDate = new Map(credits.map((c) => [c.id, c.credit_date]));

  const pAllocLive = await pagedWithFallback<{
    id: string;
    payment_id: string;
    bill_id: string;
    amount_minor: number;
    allocated_on?: string | null;
  }>(
    supabase,
    "supplier_payment_allocations",
    "id, payment_id, bill_id, amount_minor, allocated_on",
    "id, payment_id, bill_id, amount_minor",
    (q) => q.eq("company_id" as never, companyId as never),
  );
  const cAllocLive = await pagedWithFallback<{
    id: string;
    credit_note_id: string;
    bill_id: string;
    amount_minor: number;
    allocated_on?: string | null;
  }>(
    supabase,
    "purchase_credit_allocations",
    "id, credit_note_id, bill_id, amount_minor, allocated_on",
    "id, credit_note_id, bill_id, amount_minor",
    (q) => q.eq("company_id" as never, companyId as never),
  );

  let history: HistoryRow[] = [];
  try {
    history = await fetchAllPages<HistoryRow>((from, to) =>
      (supabase.from("cash_allocation_history" as never).select(
        "id, source_table, allocation_id, operation, source_row, recorded_at" as never,
      ) as unknown as Q)
        .eq("company_id" as never, companyId as never)
        .eq("operation" as never, "DELETE" as never)
        .in("source_table" as never, [
          "supplier_payment_allocations",
          "purchase_credit_allocations",
        ] as never)
        .order("id" as never)
        .range(from, to) as never,
    );
  } catch (e) {
    if (!(e instanceof Error && /relation .* does not exist|column .* does not exist/i.test(e.message))) {
      throw e;
    }
  }

  const livePaymentIds = new Set(pAllocLive.map((a) => a.id));
  const liveCreditIds = new Set(cAllocLive.map((a) => a.id));

  const paymentAllocations: Array<AsAtApAllocation & { paymentId: string }> = [
    ...pAllocLive.map((a) => ({
      paymentId: a.payment_id,
      billId: a.bill_id,
      amountMinor: Number(a.amount_minor),
      effectiveDate: a.allocated_on ?? paymentDate.get(a.payment_id) ?? "0000-01-01",
      reversedOn: null as string | null,
    })),
  ];
  const creditAllocations: Array<AsAtApAllocation & { creditNoteId: string }> = [
    ...cAllocLive.map((a) => ({
      creditNoteId: a.credit_note_id,
      billId: a.bill_id,
      amountMinor: Number(a.amount_minor),
      effectiveDate: a.allocated_on ?? creditDate.get(a.credit_note_id) ?? "0000-01-01",
      reversedOn: null as string | null,
    })),
  ];

  for (const row of history) {
    if (row.source_table === "supplier_payment_allocations") {
      if (livePaymentIds.has(row.allocation_id)) continue;
      const parsed = historyAllocation(row, "payment");
      if (!parsed?.paymentId) continue;
      paymentAllocations.push({
        paymentId: parsed.paymentId,
        billId: parsed.billId,
        amountMinor: parsed.amountMinor,
        effectiveDate: parsed.effectiveDate,
        reversedOn: parsed.reversedOn,
      });
    } else if (row.source_table === "purchase_credit_allocations") {
      if (liveCreditIds.has(row.allocation_id)) continue;
      const parsed = historyAllocation(row, "credit");
      if (!parsed?.creditNoteId) continue;
      creditAllocations.push({
        creditNoteId: parsed.creditNoteId,
        billId: parsed.billId,
        amountMinor: parsed.amountMinor,
        effectiveDate: parsed.effectiveDate,
        reversedOn: parsed.reversedOn,
      });
    }
  }

  const asBills: AsAtBill[] = billsRaw.map((r) => ({
    id: r.id,
    contactId: r.contact_id,
    contactName: r.contacts?.name ?? "Unknown",
    number: r.bill_number ?? r.supplier_invoice_number,
    currencyCode: r.currency_code,
    billDate: r.bill_date,
    dueDate: r.due_date,
    totalMinor: Number(r.total_minor),
    status: r.status,
    voidDate: r.journals?.journal_date ?? null,
  }));
  const asPayments: AsAtSupplierPayment[] = payments.map((p) => ({
    id: p.id,
    contactId: p.contact_id,
    contactName: p.contacts?.name ?? "Unknown",
    reference: p.reference,
    currencyCode: p.currency_code,
    paymentDate: p.payment_date,
    amountMinor: Number(p.amount_minor),
    status: p.status,
    voidDate: p.journals?.journal_date ?? null,
    unallocatedMinor: Number(p.unallocated_minor),
  }));
  const asCredits: AsAtPurchaseCredit[] = credits.map((c) => ({
    id: c.id,
    contactId: c.contact_id,
    contactName: c.contacts?.name ?? "Unknown",
    number: c.credit_number,
    currencyCode: c.currency_code,
    creditDate: c.credit_date,
    totalMinor: Number(c.total_minor),
    status: c.status,
    voidDate: c.journals?.journal_date ?? null,
    amountAllocatedMinor: Number(c.amount_allocated_minor),
  }));

  return {
    asOf,
    bills: asBills,
    payments: asPayments,
    creditNotes: asCredits,
    paymentAllocations,
    creditAllocations,
  };
}

async function apControlBalanceAsAt(
  supabase: SalesClient,
  companyId: string,
  asOf: string,
): Promise<number> {
  const ap = await requireApControlAccount(supabase, companyId);
  const rows = await fetchAllPages<{ debit_minor: number; credit_minor: number }>(
    (from, to) =>
      supabase
        .from("journal_lines" as never)
        .select("id, debit_minor, credit_minor, journals!inner(journal_date, status)" as never)
        .eq("company_id" as never, companyId as never)
        .eq("account_id" as never, ap.id as never)
        .eq("journals.status" as never, "posted" as never)
        .lte("journals.journal_date" as never, asOf as never)
        .order("id" as never)
        .range(from, to) as unknown as PromiseLike<{
        data: Array<{ debit_minor: number; credit_minor: number }> | null;
        error: { message: string } | null;
      }>,
  );
  // AP is credit-normal: report control as credit − debit so outstanding bills are positive.
  return rows.reduce((s, r) => s + Number(r.credit_minor) - Number(r.debit_minor), 0);
}

export const getAgedPayablesAsAt = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; asOf?: string }) => {
    if (input.asOf !== undefined && input.asOf !== "" && !isReportDate(input.asOf)) {
      throw new Error("As-at date must be YYYY-MM-DD");
    }
    return { companyId: assertUuid(input.companyId), asOf: input.asOf || null };
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertCompanyMember(supabase, data.companyId);
    await assertCompanyPermission(supabase, data.companyId, "reports.view");
    const defaults = await loadCompanyDefaults(supabase, data.companyId);
    const asOf = data.asOf ?? defaults.today;
    assertPayablesAsOfNotFuture(asOf, defaults.today);

    const inputs = await loadApAsAtInputs(supabase, data.companyId, asOf);
    const aged = buildAgedPayablesAsAt(inputs);
    const control = await apControlBalanceAsAt(supabase, data.companyId, asOf);

    const baseOnly = aged.totalsByCurrency.every((t) => t.currency_code === defaults.baseCurrency);
    const baseTotal =
      aged.totalsByCurrency.find((t) => t.currency_code === defaults.baseCurrency)?.total ?? 0;
    const variance = baseOnly ? baseTotal - control : null;
    return {
      asOf,
      baseCurrency: defaults.baseCurrency,
      rows: aged.rows,
      totalsByCurrency: aged.totalsByCurrency,
      apControlBalanceMinor: control,
      varianceMinor: variance,
      tiesToControl: variance === null ? null : variance === 0,
      diagnostic:
        variance === null
          ? "Foreign-currency documents are present: compare each currency's total with the AP control account in that currency's base-equivalent manually."
          : variance === 0
            ? null
            : "Subledger total differs from the AP control account. Check manual journals posted to AP or deleted allocations recorded before cash history was installed.",
      historyLimitation:
        "Deleted allocations are reconstructed only from cash_allocation_history (installed 2026-11-03 onward). Pre-archive deletions cannot be restored.",
    };
  });
