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
  ) return false;

  return expected.lines.every((line, index) => {
    const prior = stored.lines[index];
    return Boolean(prior) &&
      line.description === prior!.description &&
      line.accountId === prior!.account_id &&
      line.quantity === Number(prior!.quantity) &&
      line.unitPriceMinor === Number(prior!.unit_price_minor) &&
      line.taxCodeId === (prior!.tax_code_id ?? null) &&
      Number(prior!.discount_minor ?? 0) === 0 &&
      (prior!.product_id ?? null) === null;
  });
}
