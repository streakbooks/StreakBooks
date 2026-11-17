export type PurchaseOrderDetail = {
  id: string;
  version: number;
  contact_id: string;
  order_number: string | null;
  order_date: string;
  currency_code: string;
  status: string;
  subtotal_minor: number;
  tax_minor: number;
  total_minor: number;
  memo: string | null;
  billed_bill_id: string | null;
  contacts: { name: string } | null;
  purchase_order_lines: Array<{
    id: string;
    line_no: number;
    description: string;
    account_id: string;
    quantity: number;
    /** Cumulative goods received; 0 when the receipt migration is not applied yet. */
    quantity_received?: number;
    /** Cumulative quantity already converted to bills. */
    quantity_billed?: number;
    unit_price_minor: number;
    net_minor: number;
    tax_rate_bps: number;
    tax_minor: number;
  }>;
};
