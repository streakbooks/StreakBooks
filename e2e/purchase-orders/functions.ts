import type { PurchaseOrderDetail } from "../../src/lib/purchases/purchase-order-data";
import type {
  PurchaseOrderActivity,
  PurchaseOrderActionPayload,
} from "../../src/lib/purchases/po-controls.functions";
const mode = new URLSearchParams(location.search).get("state") ?? "draft";
const state: PurchaseOrderDetail = {
  id: "order",
  version: 1,
  contact_id: "supplier",
  order_number: "PO-0042",
  order_date: "2026-11-01",
  currency_code: "USD",
  status: mode === "sent" ? "sent" : "draft",
  approval_state: mode === "pending" ? "pending" : mode === "sent" ? "approved" : "draft",
  created_by: "maker",
  submitted_by: mode === "pending" ? "maker" : null,
  submitted_at: null,
  approved_by: null,
  approved_at: null,
  approval_comment: null,
  supplier_reference: null,
  expected_delivery_date: "2026-11-02",
  acknowledged_on: null,
  delivery_address: null,
  terms: null,
  subtotal_minor: 10000,
  tax_minor: 0,
  total_minor: 10000,
  memo: "Deliver during office hours",
  billed_bill_id: null,
  contacts: { name: "Acme Supply" },
  purchase_order_lines: [
    {
      id: "line",
      line_no: 1,
      description: "Office chairs",
      account_id: "account",
      quantity: 10,
      quantity_received: 0,
      quantity_billed: 0,
      unit_price_minor: 1000,
      net_minor: 10000,
      tax_rate_bps: 0,
      tax_minor: 0,
    },
  ],
};
const activity: PurchaseOrderActivity = { receipts: [], history: [], bills: [] };
const copy = <T>(value: T): T => structuredClone(value);
export const getPurchaseOrder = async () => copy(state);
export const getPurchaseOrderActivity = async () => copy(activity);
export const managePurchaseOrder = async ({
  data,
}: {
  data: { action: string; version: number; payload?: PurchaseOrderActionPayload };
}) => {
  if (data.version !== state.version) throw new Error("Order changed; reload");
  if (data.action === "submit") {
    state.approval_state = "pending";
    state.submitted_by = "maker";
  }
  if (data.action === "approve") state.approval_state = "approved";
  if (data.action === "send") state.status = "sent";
  if (data.action === "metadata")
    Object.assign(state, {
      supplier_reference: data.payload?.supplierReference,
      expected_delivery_date: data.payload?.expectedDeliveryDate,
      acknowledged_on: data.payload?.acknowledgedOn,
      delivery_address: data.payload?.deliveryAddress,
      terms: data.payload?.terms,
    });
  state.version++;
  activity.history.push({
    id: crypto.randomUUID(),
    action: `purchase_order_${data.action}`,
    actor_user_id: "maker",
    details: {},
    created_at: new Date().toISOString(),
  });
  return copy(state);
};
export const receivePurchaseOrder = async ({
  data,
}: {
  data: {
    receiptDate: string;
    reference: string;
    lines: Array<{ lineId: string; receiveQuantity: number }>;
  };
}) => {
  const quantity = data.lines.reduce((sum, line) => sum + line.receiveQuantity, 0);
  state.purchase_order_lines[0].quantity_received = quantity;
  state.status = "partially_received";
  state.version++;
  activity.receipts.push({
    id: "receipt",
    receipt_date: data.receiptDate,
    reference: data.reference,
    created_at: new Date().toISOString(),
    created_by: "maker",
    reversed_at: null,
    reversed_by: null,
    reversal_reason: null,
    lines: [{ line_id: "line", quantity }],
  });
  return { id: state.id, status: state.status, receiptId: "receipt", updated: 1 };
};
export const reversePurchaseReceipt = async () => {
  state.purchase_order_lines[0].quantity_received = 0;
  activity.receipts[0].reversed_at = new Date().toISOString();
  return { id: state.id };
};
export const convertPurchaseOrderToBill = async () => ({ billId: "bill" });
export const savePurchaseOrder = async () => ({
  id: "new-order",
  orderNumber: "PO-0043",
  version: 1,
});
