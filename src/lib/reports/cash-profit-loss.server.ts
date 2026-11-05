import type { Sb } from "@/lib/accounting/ledger-data";
import { fetchAllPages, type PageResult } from "@/lib/accounting/fetch-all";
import type { CashPnlInput } from "./cash-profit-loss";
import type { ReportingFacts } from "./report-document";

import { cashInputFromRows } from "./cash-source";
type Row = Record<string, unknown>;
/** Invoker/RLS reads only. Never uses service-role access or current paid counters. */
export async function loadCashProfitLossInput(
  supabase: Sb,
  facts: Pick<ReportingFacts, "company" | "accounts">,
  to: string,
): Promise<CashPnlInput> {
  const companyId = facts.company.id;
  const read = (name: string, columns: string, date?: string) =>
    fetchAllPages<Row>((from, end) => {
      let query = supabase
        .from(name as never)
        .select(columns as never)
        .eq("company_id" as never, companyId as never);
      if (date) query = query.lte(date as never, to as never);
      return query.order("id" as never).range(from, end) as unknown as PromiseLike<PageResult<Row>>;
    });
  const [
    lines,
    banks,
    receipts,
    payments,
    receiptAllocations,
    paymentAllocations,
    money,
    uses,
    salesCredits,
    purchaseCredits,
    history,
    invoices,
    bills,
    customerCredits,
    supplierCredits,
    classificationPolicies,
    openingEvidence,
    inventoryEvidence,
  ] = await Promise.all([
    fetchAllPages<Row>(
      (from, end) =>
        supabase
          .from("journal_lines" as never)
          .select(
            "id,account_id,debit_minor,credit_minor,description,journals!inner(id,company_id,journal_date,journal_number,source_type,source_id,currency_code,fx_rate_to_base,reverses_journal_id,memo)" as never,
          )
          .eq("company_id" as never, companyId as never)
          .eq("journals.company_id" as never, companyId as never)
          .eq("journals.status" as never, "posted" as never)
          .lte("journals.journal_date" as never, to as never)
          .order("id" as never)
          .range(from, end) as unknown as PromiseLike<PageResult<Row>>,
    ),
    read("bank_accounts", "id,gl_account_id"),
    read(
      "sales_receipts",
      "id,company_id,posted_journal_id,void_journal_id,currency_code,fx_rate_to_base,amount_minor",
      "receipt_date",
    ),
    read(
      "supplier_payments",
      "id,company_id,posted_journal_id,void_journal_id,currency_code,fx_rate_to_base,amount_minor",
      "payment_date",
    ),
    read(
      "sales_receipt_allocations",
      "id,company_id,receipt_id,invoice_id,amount_minor,allocated_on,reversed_on",
    ),
    read(
      "supplier_payment_allocations",
      "id,company_id,payment_id,bill_id,amount_minor,allocated_on",
    ),
    read(
      "money_documents",
      "id,company_id,kind,posted_journal_id,void_journal_id,currency_code,fx_rate_to_base,total_minor",
      "document_date",
    ),
    read("money_document_credit_uses", "id,document_id,source_kind,source_id,amount_minor"),
    read(
      "sales_credit_allocations",
      "id,invoice_id,credit_note_id,amount_minor,allocated_on,reversed_on",
    ),
    read("purchase_credit_allocations", "id,bill_id,credit_note_id,amount_minor,allocated_on"),
    read(
      "cash_allocation_history",
      "id,company_id,source_table,allocation_id,operation,source_row,recorded_at,event_seq",
    ),
    read("sales_invoices", "id,company_id,posted_journal_id,invoice_date"),
    read("purchase_bills", "id,company_id,posted_journal_id,bill_date"),
    read("sales_credit_notes", "id,company_id,posted_journal_id,credit_date"),
    read("purchase_credit_notes", "id,company_id,posted_journal_id,credit_date"),
    read(
      "cash_classification_policies",
      "id,company_id,source_account_id,recognition_account_id,kind,version,effective_from,effective_to,status,policy_note,evidence_reference,evidence_journal_ids,evidence_journal_snapshots,approved_by,approved_at",
    ),
    read(
      "cash_opening_evidence",
      "id,company_id,document_id,source_kind,posted_journal_id,control_account_id,equity_account_id,currency_code,gross_minor::text,components,mode,version,effective_from,effective_to,status,policy_note,evidence_reference,source_journal_snapshot,tax_lines,approved_by,approved_at",
    ),
    read("cash_inventory_evidence", "*,cost_minor::text"),
  ]);
  return cashInputFromRows(
    {
      journal_lines: lines,
      bank_accounts: banks,
      sales_receipts: receipts,
      supplier_payments: payments,
      sales_receipt_allocations: receiptAllocations,
      supplier_payment_allocations: paymentAllocations,
      money_documents: money,
      money_document_credit_uses: uses,
      sales_credit_allocations: salesCredits,
      purchase_credit_allocations: purchaseCredits,
      cash_allocation_history: history,
      sales_invoices: invoices,
      purchase_bills: bills,
      sales_credit_notes: customerCredits,
      purchase_credit_notes: supplierCredits,
      cash_classification_policies: classificationPolicies,
      cash_opening_evidence: openingEvidence,
      cash_inventory_evidence: inventoryEvidence,
    },
    facts,
  );
}
