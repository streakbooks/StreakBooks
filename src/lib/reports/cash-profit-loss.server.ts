import type { Sb } from "@/lib/accounting/ledger-data";
import { fetchAllPages, type PageResult } from "@/lib/accounting/fetch-all";
import type { CashPnlInput, CashJournal, CashPayment, CashRefund } from "./cash-profit-loss";
import type { ReportingFacts } from "./report-document";

type Row = Record<string, unknown>;
function text(row: Row, key: string): string {
  if (typeof row[key] !== "string") throw new Error(`Cash source is missing ${key}`);
  return row[key] as string;
}
function optional(row: Row, key: string): string | null {
  return row[key] == null ? null : String(row[key]);
}
function integer(row: Row, key: string): bigint {
  const value = row[key];
  if (typeof value === "number" && !Number.isSafeInteger(value))
    throw new Error("Cash source exceeds safe API integer precision");
  if (!/^-?\d+$/.test(String(value))) throw new Error(`Invalid cash source amount: ${key}`);
  return BigInt(String(value));
}

/** Invoker/RLS reads only. Never uses service-role access or current paid counters. */
export async function loadCashProfitLossInput(
  supabase: Sb,
  facts: ReportingFacts,
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
  ] = await Promise.all([
    fetchAllPages<Row>(
      (from, end) =>
        supabase
          .from("journal_lines" as never)
          .select(
            "id,account_id,debit_minor,credit_minor,journals!inner(id,company_id,journal_date,journal_number,source_type,source_id,currency_code,fx_rate_to_base,reverses_journal_id)" as never,
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
      "id,company_id,receipt_id,invoice_id,amount_minor,reversed_on",
    ),
    read("supplier_payment_allocations", "id,company_id,payment_id,bill_id,amount_minor"),
    read(
      "money_documents",
      "id,company_id,kind,posted_journal_id,void_journal_id,currency_code,fx_rate_to_base,total_minor",
      "document_date",
    ),
    read("money_document_credit_uses", "id,document_id,source_kind,source_id,amount_minor"),
    read("sales_credit_allocations", "id,invoice_id,credit_note_id,allocated_on,reversed_on"),
    read("purchase_credit_allocations", "id,bill_id,credit_note_id"),
  ]);
  const journalMap = new Map<string, CashJournal>();
  for (const line of lines) {
    const header = line["journals"] as Row;
    if (!header || Array.isArray(header))
      throw new Error("Cash journal relationship is unavailable");
    const id = text(header, "id");
    if (!journalMap.has(id))
      journalMap.set(id, {
        id,
        companyId: text(header, "company_id"),
        date: text(header, "journal_date"),
        number: String(header["journal_number"]),
        sourceType: text(header, "source_type"),
        sourceId: optional(header, "source_id"),
        currency:
          optional(header, "currency_code")?.trim().toUpperCase() ?? facts.company.baseCurrency,
        rate: optional(header, "fx_rate_to_base"),
        reverses: optional(header, "reverses_journal_id"),
        lines: [],
      });
    journalMap.get(id)!.lines.push({
      accountId: text(line, "account_id"),
      debit: integer(line, "debit_minor"),
      credit: integer(line, "credit_minor"),
    });
  }
  const payment = (
    row: Row,
    side: "income" | "expense",
    amountKey = "amount_minor",
  ): CashPayment => ({
    id: text(row, "id"),
    companyId: text(row, "company_id"),
    side,
    journalId: text(row, "posted_journal_id"),
    voidJournalId: optional(row, "void_journal_id"),
    currency: text(row, "currency_code").trim().toUpperCase(),
    rate: optional(row, "fx_rate_to_base"),
    amount: integer(row, amountKey),
  });
  return {
    companyId,
    baseCurrency: facts.company.baseCurrency,
    accounts: facts.accounts,
    cashAccountIds: [
      ...new Set([
        ...banks.map((row) => text(row, "gl_account_id")),
        ...facts.accounts
          .filter(
            (a) =>
              a.account_kind === "bank" ||
              a.subtype === "bank" ||
              ["bank", "cash", "undeposited_funds"].includes(a.system_key ?? ""),
          )
          .map((a) => a.id),
      ]),
    ],
    journals: [...journalMap.values()],
    payments: [
      ...receipts.filter((row) => row["posted_journal_id"]).map((row) => payment(row, "income")),
      ...payments.filter((row) => row["posted_journal_id"]).map((row) => payment(row, "expense")),
    ],
    allocations: [
      ...receiptAllocations.map((row) => ({
        id: text(row, "id"),
        companyId: text(row, "company_id"),
        paymentId: text(row, "receipt_id"),
        documentId: text(row, "invoice_id"),
        amount: integer(row, "amount_minor"),
        reversedOn: optional(row, "reversed_on"),
      })),
      ...paymentAllocations.map((row) => ({
        id: text(row, "id"),
        companyId: text(row, "company_id"),
        paymentId: text(row, "payment_id"),
        documentId: text(row, "bill_id"),
        amount: integer(row, "amount_minor"),
        reversedOn: null,
      })),
    ],
    creditAllocations: [
      ...salesCredits.map((row) => ({
        documentId: text(row, "invoice_id"),
        creditId: text(row, "credit_note_id"),
        allocatedOn: optional(row, "allocated_on"),
        reversedOn: optional(row, "reversed_on"),
      })),
      ...purchaseCredits.map((row) => ({
        documentId: text(row, "bill_id"),
        creditId: text(row, "credit_note_id"),
        allocatedOn: null,
        reversedOn: null,
      })),
    ],
    refunds: money
      .filter(
        (row) =>
          row["posted_journal_id"] &&
          ["customer_refund", "supplier_refund"].includes(String(row["kind"])),
      )
      .map((row): CashRefund => ({
        ...payment(row, row["kind"] === "customer_refund" ? "income" : "expense", "total_minor"),
        uses: uses
          .filter((use) => use["document_id"] === row["id"])
          .map((use) => ({
            id: text(use, "id"),
            documentId: text(use, "source_id"),
            kind: text(use, "source_kind"),
            amount: integer(use, "amount_minor"),
          })),
      })),
  };
}
