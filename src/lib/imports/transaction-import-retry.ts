/**
 * Strict, read-only comparison for CSV invoice/bill retries.
 *
 * A matching external number is NOT proof of idempotency. Do not silently
 * skip a different document just because a unique number already exists.
 * This compares source headers and ordered lines against the persisted
 * domain document; no journals or documents are written here.
 */
export type ExpectedImportRetry = {
  contactId: string;
  documentDate: string;
  dueDate: string;
  currencyCode: string;
  lines: Array<{
    description: string;
    accountId: string;
    quantity: number;
    unitPriceMinor: number;
    taxCodeId: string | null;
  }>;
};

export type StoredImportRetry = {
  contact_id: string;
  document_date: string;
  due_date: string;
  currency_code: string;
  memo?: string | null;
  lines: Array<{
    description: string;
    account_id: string;
    quantity: number | string;
    unit_price_minor: number | string;
    tax_code_id: string | null;
    discount_minor?: number | string | null;
    product_id?: string | null;
  }>;
};

export function isExactTransactionImportRetry(
  expected: ExpectedImportRetry,
  stored: StoredImportRetry,
): boolean {
  if (
    expected.contactId !== stored.contact_id ||
    expected.documentDate !== stored.document_date ||
    expected.dueDate !== stored.due_date ||
    expected.currencyCode !== stored.currency_code ||
    (stored.memo ?? "") !== "" ||
    expected.lines.length !== stored.lines.length
  )
    return false;

  return expected.lines.every((line, index) => {
    const prior = stored.lines[index];
    return (
      Boolean(prior) &&
      line.description === prior!.description &&
      line.accountId === prior!.account_id &&
      line.quantity === Number(prior!.quantity) &&
      line.unitPriceMinor === Number(prior!.unit_price_minor) &&
      line.taxCodeId === (prior!.tax_code_id ?? null) &&
      Number(prior!.discount_minor ?? 0) === 0 &&
      (prior!.product_id ?? null) === null
    );
  });
}

/**
 * A matching CSV is not a completed posting. A paid/authorised invoice or
 * bill without its posting journal must never be silently skipped on retry.
 * Likewise a draft carrying a journal is an inconsistent accounting state.
 *
 * This is a read-only guard; retrying an unposted draft with authorisation
 * requested requires manual review rather than silently authorising a
 * possibly edited document.
 */
export type TransactionImportRetryDisposition = "skip" | "manual_authorisation" | "invalid";

export function classifyTransactionImportRetry(
  status: string,
  postedJournalId: string | null,
  requestedAuthorisation: boolean,
): TransactionImportRetryDisposition {
  if (status === "draft" || status === "awaiting_approval") {
    if (postedJournalId) return "invalid";
    return requestedAuthorisation ? "manual_authorisation" : "skip";
  }
  if (status === "authorised" || status === "partly_paid" || status === "paid") {
    return postedJournalId ? "skip" : "invalid";
  }
  return "invalid";
}

/**
 * Verify a persisted posting journal before declaring a CSV retry complete.
 * A non-null posted_journal_id alone is not proof: it could reference a
 * different organisation/document, a draft journal, or a legacy seed entry
 * without source provenance. Reject such cases for manual reconciliation.
 */
export type PostedImportJournal = {
  id: string;
  company_id: string;
  status: string;
  source_type: string;
  source_id: string | null;
};

export function isVerifiedTransactionImportJournal(
  expected: {
    companyId: string;
    documentId: string;
    journalId: string;
    sourceType: "sales_invoice" | "purchase_bill";
  },
  journal: PostedImportJournal | null,
): boolean {
  return (
    journal !== null &&
    journal.id === expected.journalId &&
    journal.company_id === expected.companyId &&
    journal.status === "posted" &&
    journal.source_type === expected.sourceType &&
    journal.source_id === expected.documentId
  );
}

/**
 * Read-only GL/subledger guard for a previously posted CSV invoice or bill.
 * A journal with valid provenance can still be unbalanced or have the wrong
 * AR/AP control posting. Never skip such a retry without reconciliation.
 *
 * All journal lines must be returned by an organisation-filtered query.
 * A caller must fail closed on query errors or pagination/truncation.
 * Amounts are in the original journal/document minor units, not FX-converted.
 */
export type TransactionImportJournalLine = {
  company_id: string;
  journal_id: string;
  account_id: string;
  debit_minor: number | string | bigint;
  credit_minor: number | string | bigint;
};

export function isReconciledTransactionImportJournal(
  expected: {
    companyId: string;
    journalId: string;
    controlAccountId: string;
    controlSide: "debit" | "credit";
    expectedTotalMinor: bigint;
    persistedTotalMinor: number | string | bigint;
  },
  lines: readonly TransactionImportJournalLine[] | null,
): boolean {
  if (!lines || lines.length < 2 || lines.length > 500 || expected.expectedTotalMinor <= 0n) {
    return false;
  }
  try {
    if (BigInt(expected.persistedTotalMinor) !== expected.expectedTotalMinor) return false;
    let debit = 0n;
    let credit = 0n;
    let controlCount = 0;
    for (const line of lines) {
      if (
        line.company_id !== expected.companyId ||
        line.journal_id !== expected.journalId ||
        !line.account_id
      )
        return false;
      const dr = BigInt(line.debit_minor);
      const cr = BigInt(line.credit_minor);
      // Each posted GL line must be single-sided and positive.
      if (dr < 0n || cr < 0n || dr > 0n === cr > 0n) return false;
      debit += dr;
      credit += cr;
      if (line.account_id === expected.controlAccountId) {
        controlCount++;
        if (
          (expected.controlSide === "debit" && (dr !== expected.expectedTotalMinor || cr !== 0n)) ||
          (expected.controlSide === "credit" && (cr !== expected.expectedTotalMinor || dr !== 0n))
        )
          return false;
      }
    }
    return controlCount === 1 && debit === credit;
  } catch {
    // Corrupt or non-integral values are not proof of an idempotent posting.
    return false;
  }
}
