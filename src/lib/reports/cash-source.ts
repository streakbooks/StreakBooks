import type { CashPnlInput, CashJournal, CashPayment, CashRefund } from "./cash-profit-loss";
import { isReportDate } from "./date-validation";
import type { ReportingFacts } from "./report-document";
import type {
  CashClassificationKind,
  CashJournalEvidenceSnapshot,
  CashOpeningEvidence,
} from "./cash-classification";
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

/** Normalize append-only OLD snapshots into dated allocation versions.
 * Current paid counters are never used to reconstruct missing amounts. Future
 * events have a DB sequence; genuinely ambiguous legacy order remains explicit.
 */
export function normalizeCashAllocationHistory(
  rows: Row[],
  history: Row[],
  options: {
    companyId: string;
    sourceTable: string;
    parentKey: string;
    parents: Row[];
    parentDateKey?: string;
    journalDates?: ReadonlyMap<string, string>;
    requireVoid?: boolean;
  },
): Row[] {
  // Draft posting/compensation may also archive OLD allocation rows. Without a
  // posted source journal those rows never entered either accounting basis.
  const parents = new Map(
    options.parents
      .filter((parent) => parent["posted_journal_id"])
      .map((parent) => [text(parent, "id"), parent]),
  );
  const applicableRows = rows.filter((row) => parents.has(text(row, options.parentKey)));
  const grouped = new Map<string, Row[]>();
  for (const event of history) {
    if (event["source_table"] !== options.sourceTable) continue;
    const row = event["source_row"] as Row;
    if (!row || typeof row !== "object" || Array.isArray(row))
      throw new Error("Invalid archived cash allocation");
    if (!parents.has(text(row, options.parentKey))) continue;
    const id = text(event, "allocation_id");
    if (
      text(event, "company_id") !== options.companyId ||
      text(row, "company_id") !== options.companyId ||
      text(row, "id") !== id
    )
      throw new Error("Invalid or cross-company cash allocation history");
    if (!["UPDATE", "DELETE"].includes(text(event, "operation")))
      throw new Error("Invalid cash allocation history operation");
    grouped.set(id, [...(grouped.get(id) ?? []), event]);
  }
  const result = applicableRows
    .filter((row) => !grouped.has(text(row, "id")))
    .map((row) => ({ ...row }));
  for (const [id, events] of grouped) {
    const current = applicableRows.find((row) => row["id"] === id);
    if (events.some((event) => !optional(event, "recorded_at"))) {
      if (events.length !== 1 || events[0]!["operation"] !== "DELETE" || current)
        throw new Error(
          "Changed cash allocations need verified dated reallocation recognition history",
        );
      const event = events[0]!,
        row = event["source_row"] as Row;
      const parent = parents.get(text(row, options.parentKey))!;
      if (!parent["void_journal_id"])
        throw new Error("Archived cash allocation has no matching source void");
      result.push({
        ...row,
        reversed_on: options.journalDates?.get(String(parent["void_journal_id"])) ?? null,
      });
      continue;
    }
    events.sort((a, b) => {
      const date = text(a, "recorded_at").localeCompare(text(b, "recorded_at"));
      if (date) return date;
      const sa = optional(a, "event_seq"),
        sb = optional(b, "event_seq");
      if (sa && sb) return BigInt(sa) < BigInt(sb) ? -1 : BigInt(sa) > BigInt(sb) ? 1 : 0;
      if (JSON.stringify(a["source_row"]) !== JSON.stringify(b["source_row"]))
        throw new Error("Ambiguous legacy cash allocation version order requires source history");
      return 0;
    });
    let previousDate: string | null = null;
    for (const [index, event] of events.entries()) {
      if (index < events.length - 1 && event["operation"] === "DELETE")
        throw new Error("Cash allocation history reuses a deleted row identity");
      const row = event["source_row"] as Row;
      const parent = parents.get(text(row, options.parentKey))!;
      const recorded = text(event, "recorded_at").slice(0, 10);
      if (!isReportDate(recorded)) throw new Error("Invalid cash allocation history date");
      if (
        options.requireVoid &&
        (events.length !== 1 ||
          event["operation"] !== "DELETE" ||
          !parent["void_journal_id"] ||
          current)
      )
        throw new Error("Cash refund credit uses require the matching posted source void");
      const start =
        [
          optional(row, "allocated_on"),
          previousDate,
          options.parentDateKey ? optional(parent, options.parentDateKey) : null,
          options.journalDates?.get(String(parent["posted_journal_id"])) ?? null,
        ]
          .filter((date): date is string => Boolean(date))
          .sort()
          .at(-1) ?? null;
      const end =
        event["operation"] === "DELETE" && parent["void_journal_id"]
          ? (options.journalDates?.get(String(parent["void_journal_id"])) ?? recorded)
          : recorded;
      result.push({
        ...row,
        id: `${id}:history:${text(event, "id")}`,
        allocated_on: start,
        reversed_on: end,
      });
      previousDate = recorded;
    }
    const last = events.at(-1)!;
    if (last["operation"] === "DELETE") {
      if (current) throw new Error("Archived cash allocation still has a conflicting active row");
    } else {
      if (!current) throw new Error("Cash allocation UPDATE history has no current version");
      const start =
        [optional(current, "allocated_on"), previousDate]
          .filter((date): date is string => Boolean(date))
          .sort()
          .at(-1) ?? null;
      result.push({ ...current, allocated_on: start });
    }
  }
  return result;
}

export type CashSourceRows = Record<string, Row[]>;
/** Shared by interactive invoker reads and immutable queued snapshots. */
export function cashInputFromRows(
  source: CashSourceRows,
  facts: Pick<ReportingFacts, "company" | "accounts">,
): CashPnlInput {
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
        memo: optional(header, "memo"),
        lines: [],
      });
    journalMap.get(id)!.lines.push({
      accountId: text(line, "account_id"),
      debit: integer(line, "debit_minor"),
      credit: integer(line, "credit_minor"),
      description: optional(line, "description"),
      ...(optional(line, "id") ? { lineId: text(line, "id") } : {}),
    });
  }
  const journalDates = new Map(
    [...journalMap.values()].map((journal) => [journal.id, journal.date]),
  );
  const normalizedPayments = normalizeCashAllocationHistory(paymentAllocations, history, {
    companyId,
    sourceTable: "supplier_payment_allocations",
    parentKey: "payment_id",
    parents: payments,
    journalDates,
  });
  const normalizedUses = normalizeCashAllocationHistory(uses, history, {
    companyId,
    sourceTable: "money_document_credit_uses",
    parentKey: "document_id",
    parents: money,
    journalDates,
    requireVoid: true,
  });
  const normalizedCredits = normalizeCashAllocationHistory(purchaseCredits, history, {
    companyId,
    sourceTable: "purchase_credit_allocations",
    parentKey: "credit_note_id",
    parents: source["purchase_credit_notes"] ?? [],
    journalDates,
  });
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
    classificationPolicies: (source["cash_classification_policies"] ?? []).map((row) => ({
      id: text(row, "id"),
      companyId: text(row, "company_id"),
      sourceAccountId: text(row, "source_account_id"),
      recognitionAccountId: text(row, "recognition_account_id"),
      kind: text(row, "kind") as CashClassificationKind,
      version: Number(integer(row, "version")),
      effectiveFrom: text(row, "effective_from"),
      effectiveTo: optional(row, "effective_to"),
      status: text(row, "status"),
      policyNote: text(row, "policy_note"),
      evidenceReference: text(row, "evidence_reference"),
      evidenceJournalIds: Array.isArray(row["evidence_journal_ids"])
        ? (row["evidence_journal_ids"] as string[])
        : [],
      evidenceJournalSnapshots: Array.isArray(row["evidence_journal_snapshots"])
        ? (row["evidence_journal_snapshots"] as CashJournalEvidenceSnapshot[])
        : [],
      approvedBy: optional(row, "approved_by"),
      approvedAt: optional(row, "approved_at"),
    })),
    inventoryEvidence: (source["cash_inventory_evidence"] ?? []).map((row) => ({
      id: text(row, "id"),
      companyId: text(row, "company_id"),
      purchaseDocumentId: text(row, "purchase_document_id"),
      purchaseJournalId: text(row, "purchase_journal_id"),
      inventoryAccountId: text(row, "inventory_account_id"),
      movementJournalId: text(row, "movement_journal_id"),
      movementKind: text(row, "movement_kind") as "sale" | "customer_return" | "supplier_return",
      costMinor: integer(row, "cost_minor"),
      reversesEvidenceId: optional(row, "reverses_evidence_id"),
      supersedesId: optional(row, "supersedes_id"),
      version: Number(integer(row, "version")),
      status: text(row, "status"),
      policyNote: text(row, "policy_note"),
      evidenceReference: text(row, "evidence_reference"),
      purchaseJournalSnapshot: row["purchase_journal_snapshot"] as CashJournalEvidenceSnapshot,
      movementJournalSnapshot: row["movement_journal_snapshot"] as CashJournalEvidenceSnapshot,
      approvedBy: optional(row, "approved_by"),
      approvedAt: optional(row, "approved_at"),
    })),
    openingEvidence: (source["cash_opening_evidence"] ?? []).map((row): CashOpeningEvidence => ({
      id: text(row, "id"),
      companyId: text(row, "company_id"),
      documentId: text(row, "document_id"),
      sourceKind: text(row, "source_kind") as CashOpeningEvidence["sourceKind"],
      postedJournalId: text(row, "posted_journal_id"),
      controlAccountId: text(row, "control_account_id"),
      equityAccountId: text(row, "equity_account_id"),
      currency: text(row, "currency_code"),
      grossMinor: integer(row, "gross_minor"),
      components: (row["components"] as Row[]).map((component) => ({
        accountId: text(component, "account_id"),
        amountMinor: integer(component, "amount_minor"),
      })),
      mode: text(row, "mode") as CashOpeningEvidence["mode"],
      version: Number(integer(row, "version")),
      effectiveFrom: text(row, "effective_from"),
      effectiveTo: optional(row, "effective_to"),
      status: text(row, "status"),
      policyNote: text(row, "policy_note"),
      evidenceReference: text(row, "evidence_reference"),
      approvedBy: optional(row, "approved_by"),
      approvedAt: optional(row, "approved_at"),
      sourceJournalSnapshot: row["source_journal_snapshot"] as CashJournalEvidenceSnapshot,
      ...(Array.isArray(row["tax_lines"])
        ? {
            taxLines: (row["tax_lines"] as Row[]).map((line) => ({
              id: text(line, "id"),
              netMinor: integer(line, "net_minor"),
              taxMinor: integer(line, "tax_minor"),
              taxCodeId: optional(line, "tax_code_id"),
            })),
          }
        : {}),
    })),
    cashAccountIds: [
      ...new Set([
        ...banks.map((row) => text(row, "gl_account_id")),
        ...facts.accounts
          .filter(
            (a) =>
              ["bank", "credit_card"].includes(a.account_kind ?? "") ||
              ["bank", "credit_card"].includes(a.subtype ?? "") ||
              [
                "bank",
                "cash",
                "undeposited_funds",
                "stripe_clearing",
                "payment_processor_clearing",
              ].includes(a.system_key ?? ""),
          )
          .map((a) => a.id),
      ]),
    ],
    journals: [...journalMap.values()],
    documentJournalLinks: [
      ["sales_invoices", "sales_invoice", "invoice_date"],
      ["purchase_bills", "purchase_bill", "bill_date"],
      ["sales_credit_notes", "sales_credit_note", "credit_date"],
      ["purchase_credit_notes", "purchase_credit_note", "credit_date"],
    ].flatMap(([table, sourceType, dateKey]) =>
      (source[table!] ?? [])
        .filter((row) => row["posted_journal_id"])
        .map((row) => ({
          documentId: text(row, "id"),
          companyId: text(row, "company_id"),
          journalId: text(row, "posted_journal_id"),
          sourceType: sourceType!,
          date: optional(row, dateKey!),
        })),
    ),
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
        allocatedOn: optional(row, "allocated_on"),
      })),
      ...normalizedPayments
        .filter((row) =>
          payments.some(
            (parent) => parent["id"] === row["payment_id"] && parent["posted_journal_id"],
          ),
        )
        .map((row) => ({
          id: text(row, "id"),
          companyId: text(row, "company_id"),
          paymentId: text(row, "payment_id"),
          documentId: text(row, "bill_id"),
          amount: integer(row, "amount_minor"),
          reversedOn: optional(row, "reversed_on"),
          allocatedOn: optional(row, "allocated_on"),
        })),
    ],
    creditAllocations: [
      ...salesCredits.map((row) => ({
        id: text(row, "id"),
        documentId: text(row, "invoice_id"),
        creditId: text(row, "credit_note_id"),
        allocatedOn: optional(row, "allocated_on"),
        reversedOn: optional(row, "reversed_on"),
        ...(row["amount_minor"] == null ? {} : { amount: integer(row, "amount_minor") }),
      })),
      ...normalizedCredits.map((row) => ({
        id: text(row, "id"),
        documentId: text(row, "bill_id"),
        creditId: text(row, "credit_note_id"),
        allocatedOn: optional(row, "allocated_on"),
        reversedOn: optional(row, "reversed_on"),
        ...(row["amount_minor"] == null ? {} : { amount: integer(row, "amount_minor") }),
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
        uses: normalizedUses
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
