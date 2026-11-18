export type PurchaseLineColumnKey =
  | "item"
  | "description"
  | "quantity"
  | "unitPrice"
  | "discount"
  | "account"
  | "tax"
  | "class"
  | "location"
  | "customer"
  | "project"
  | "billable"
  | "amount";

/** Fixed default widths — avoid autofit when cells fill with long labels. */
export const DEFAULT_PURCHASE_LINE_COLUMN_WIDTHS = {
  reorder: 36,
  item: 168,
  description: 200,
  quantity: 72,
  unitPrice: 100,
  discount: 88,
  account: 188,
  tax: 148,
  class: 120,
  location: 120,
  customer: 148,
  billable: 72,
  amount: 100,
  actions: 96,
} as const;

export const DEFAULT_SALES_LINE_COLUMN_WIDTHS = {
  item: 220,
  account: 168,
  qty: 72,
  price: 100,
  discount: 88,
  tax: 160,
  rate: 72,
  actions: 48,
} as const;

export const PURCHASE_LINE_COLUMN_OPTIONS: Array<{
  id: PurchaseLineColumnKey;
  label: string;
  required?: boolean;
}> = [
  { id: "item", label: "Item / service" },
  { id: "description", label: "Description", required: true },
  { id: "quantity", label: "Qty", required: true },
  { id: "unitPrice", label: "Unit price", required: true },
  { id: "discount", label: "Discount" },
  { id: "account", label: "Expense / asset account", required: true },
  { id: "tax", label: "Tax rate", required: true },
  { id: "class", label: "Class" },
  { id: "location", label: "Location" },
  { id: "customer", label: "Customer" },
  { id: "project", label: "Project" },
  { id: "billable", label: "Billable" },
  { id: "amount", label: "Amount", required: true },
];

export function clampColumnWidth(widthPx: number, min = 64, max = 480): number {
  if (!Number.isFinite(widthPx)) return min;
  return Math.min(max, Math.max(min, Math.round(widthPx)));
}
