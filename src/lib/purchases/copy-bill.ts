/**
 * Map a stored purchase bill into a new draft payload (copy bill).
 * Dates, numbers and posted journals are never copied — only supplier, memo, currency and lines.
 */

export type StoredBillLineForCopy = {
  description: string;
  account_id: string | null;
  quantity: number;
  unit_price_minor: number;
  discount_minor?: number | null;
  tax_rate_bps?: number | null;
  product_id?: string | null;
  tax_code_id?: string | null;
  class_option_id?: string | null;
  location_option_id?: string | null;
  project_option_id?: string | null;
  customer_contact_id?: string | null;
  is_billable?: boolean | null;
  line_no?: number | null;
};

export function mapBillLinesForCopy(lines: StoredBillLineForCopy[]) {
  const ordered = [...lines].sort((a, b) => Number(a.line_no ?? 0) - Number(b.line_no ?? 0));
  return ordered.map((l) => {
    if (!l.account_id) throw new Error("Cannot copy a bill line without an expense/asset account");
    return {
      description: l.description,
      accountId: l.account_id,
      quantity: Number(l.quantity),
      unitPriceMinor: Number(l.unit_price_minor),
      discountMinor: Number(l.discount_minor ?? 0),
      taxRateBps: Number(l.tax_rate_bps ?? 0),
      productId: l.product_id ?? null,
      taxCodeId: l.tax_code_id ?? null,
      classOptionId: l.class_option_id ?? null,
      locationOptionId: l.location_option_id ?? null,
      projectOptionId: l.project_option_id ?? null,
      customerContactId: l.customer_contact_id ?? null,
      isBillable: Boolean(l.is_billable),
    };
  });
}
