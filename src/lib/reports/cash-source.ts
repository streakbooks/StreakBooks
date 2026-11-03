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

export type CashSourceRows = Record<string, Row[]>;
/** Shared by interactive invoker reads and immutable queued snapshots. */
export function cashInputFromRows(source: CashSourceRows, facts: ReportingFacts): CashPnlInput {
  for (const table of [
    "journal_lines",
    "bank_accounts",
    "sales_receipts",
    "supplier_payments",
    "sales_receipt_allocations",
    "supplier_payment_allocations",
    "money_documents",
    "money_document_credit_uses",
    "sales_credit_allocations",
    "purchase_credit_allocations",
    "cash_allocation_history",
  ])
    if (!Array.isArray(source[table])) throw new Error(`Incomplete cash source snapshot: ${table}`);
  const companyId = facts.company.id;
  const lines = [...(source["journal_lines"] ?? [])];
  const banks = [...(source["bank_accounts"] ?? [])];
  const receipts = [...(source["sales_receipts"] ?? [])];
  const payments = [...(source["supplier_payments"] ?? [])];
  const receiptAllocations = [...(source["sales_receipt_allocations"] ?? [])];
  const paymentAllocations = [...(source["supplier_payment_allocations"] ?? [])];
  const money = [...(source["money_documents"] ?? [])];
  const uses = [...(source["money_document_credit_uses"] ?? [])];
  const salesCredits = [...(source["sales_credit_allocations"] ?? [])];
  const purchaseCredits = [...(source["purchase_credit_allocations"] ?? [])];
  const history = [...(source["cash_allocation_history"] ?? [])];
  // A deleted allocation is usable only when the parent has an actual posted
  // void. Reallocations and repeated versions need a separate event policy.
  for (const [table, rows, parents, parentKey] of [
    ["supplier_payment_allocations", paymentAllocations, payments, "payment_id"],
    ["money_document_credit_uses", uses, money, "document_id"],
  ] as const) {
    const archived = history.filter((event) => event["source_table"] === table);
    const byId = new Map<string, Row[]>();
    for (const event of archived) {
      const row = event["source_row"] as Row;
      if (!row || typeof row !== "object" || Array.isArray(row))
        throw new Error("Invalid archived cash allocation");
      if (!parents.some((parent) => parent["id"] === row[parentKey])) continue;
      const id = text(event, "allocation_id");
      if (
        text(event, "company_id") !== companyId ||
        text(row, "company_id") !== companyId ||
        text(row, "id") !== id
      )
        throw new Error("Invalid or cross-company cash allocation history");
      byId.set(id, [...(byId.get(id) ?? []), event]);
    }
    for (const [id, events] of byId) {
      if (events.length !== 1 || events[0]!["operation"] !== "DELETE")
        throw new Error("Changed cash allocations need reviewed reallocation recognition history");
      const row = events[0]!["source_row"] as Row;
      const parent = parents.find((parent) => parent["id"] === row[parentKey])!;
      if (rows.some((live) => live["id"] === id) || !parent["void_journal_id"])
        throw new Error("Archived cash allocation has no matching source void");
      rows.push(row);
    }
  }
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
