import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import { assertOrderDate } from "@/lib/purchases/purchase-order";
import { workflowRpc } from "@/lib/workflows-rpc.server";
import type { JsonValue } from "@/lib/platform/catalog";

export type PurchaseOrderAction =
  "submit" | "approve" | "reject" | "reset" | "send" | "cancel" | "metadata";
export type PurchaseOrderActionPayload = {
  comment?: string;
  supplierReference?: string;
  expectedDeliveryDate?: string | null;
  acknowledgedOn?: string | null;
  deliveryAddress?: string;
  terms?: string;
};
export type PurchaseOrderActionResult = {
  id: string;
  status: string;
  approval_state: string;
  version: number;
};
export type PurchaseOrderActivity = {
  receipts: Array<{
    id: string;
    receipt_date: string;
    reference: string | null;
    created_at: string;
    created_by: string;
    reversed_at: string | null;
    reversed_by: string | null;
    reversal_reason: string | null;
    lines: Array<{ line_id: string; quantity: number }>;
  }>;
  history: Array<{
    id: string;
    action: string;
    actor_user_id: string;
    details: Record<string, JsonValue>;
    created_at: string;
  }>;
  bills: Array<{
    id: string;
    bill_number: string | null;
    bill_date: string;
    status: string;
    total_minor: number;
    currency_code: string;
  }>;
};
function text(value: unknown, label: string, max: number): string {
  if (typeof value !== "string" || value.trim().length > max)
    throw new Error(`${label} must be up to ${max} characters`);
  return value.trim();
}
function optionalDate(value: string | null): string | null {
  return value == null ? value : value === "" ? null : assertOrderDate(value);
}
export const managePurchaseOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      orderId: string;
      version: number;
      action: PurchaseOrderAction;
      payload?: PurchaseOrderActionPayload;
    }) => {
      if (
        !["submit", "approve", "reject", "reset", "send", "cancel", "metadata"].includes(
          input.action,
        )
      )
        throw new Error("Invalid purchase order action");
      if (!Number.isSafeInteger(input.version) || input.version < 1)
        throw new Error("Reload the current order before continuing");
      const payload: PurchaseOrderActionPayload = {};
      const raw = input.payload ?? {};
      for (const [key, label, max] of [
        ["comment", "Comment", 2000],
        ["supplierReference", "Supplier reference", 200],
        ["deliveryAddress", "Delivery address", 2000],
        ["terms", "Terms", 4000],
      ] as const) {
        if (raw[key] !== undefined) payload[key] = text(raw[key], label, max);
      }
      if (["reject", "cancel"].includes(input.action) && (payload.comment?.length ?? 0) < 3)
        throw new Error("Enter a reason with at least three characters");
      if (raw.expectedDeliveryDate !== undefined)
        payload.expectedDeliveryDate = optionalDate(raw.expectedDeliveryDate);
      if (raw.acknowledgedOn !== undefined)
        payload.acknowledgedOn = optionalDate(raw.acknowledgedOn);
      return {
        companyId: assertUuid(input.companyId),
        orderId: assertUuid(input.orderId, "order"),
        version: input.version,
        action: input.action,
        payload,
      };
    },
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(
      context.supabase,
      data.companyId,
      ["approve", "reject"].includes(data.action) ? "purchases.authorise" : "purchases.draft",
    );
    return workflowRpc<PurchaseOrderActionResult>(context.supabase, "manage_purchase_order", {
      _company: data.companyId,
      _order: data.orderId,
      _version: data.version,
      _action: data.action,
      _payload: data.payload,
    });
  });
export const receivePurchaseOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      orderId: string;
      requestId: string;
      receiptDate: string;
      reference?: string;
      lines: Array<{ lineId: string; receiveQuantity: number }>;
    }) => {
      if (!Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > 200)
        throw new Error("Add between 1 and 200 receipt lines");
      const seen = new Set<string>();
      const lines = input.lines.map((line) => {
        const lineId = assertUuid(line.lineId, "order line");
        if (seen.has(lineId)) throw new Error("Each order line can appear once in a receipt");
        seen.add(lineId);
        const qty = Number(line.receiveQuantity);
        if (!Number.isFinite(qty) || qty <= 0 || qty > 1e9 || qty !== Number(qty.toFixed(6)))
          throw new Error("Enter a positive quantity with up to six decimal places");
        return { lineId, receiveQuantity: qty };
      });
      return {
        companyId: assertUuid(input.companyId),
        orderId: assertUuid(input.orderId, "order"),
        requestId: assertUuid(input.requestId, "request"),
        receiptDate: assertOrderDate(input.receiptDate),
        reference: text(input.reference ?? "", "Receipt reference", 200),
        lines,
      };
    },
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "purchases.draft");
    return workflowRpc<{ id: string; status: string; version: number; receiptId: string }>(
      context.supabase,
      "receive_purchase_order",
      {
        _company: data.companyId,
        _order: data.orderId,
        _request: data.requestId,
        _date: data.receiptDate,
        _reference: data.reference,
        _lines: data.lines,
      },
    );
  });
export const reversePurchaseReceipt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      orderId: string;
      receiptId: string;
      requestId: string;
      reason: string;
    }) => {
      const reason = text(input.reason, "Reversal reason", 2000);
      if (reason.length < 3)
        throw new Error("Enter a reversal reason with at least three characters");
      return {
        companyId: assertUuid(input.companyId),
        orderId: assertUuid(input.orderId, "order"),
        receiptId: assertUuid(input.receiptId, "receipt"),
        requestId: assertUuid(input.requestId, "request"),
        reason,
      };
    },
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "purchases.draft");
    return workflowRpc<{ id: string; status: string; version: number; receiptId: string }>(
      context.supabase,
      "reverse_purchase_receipt",
      {
        _company: data.companyId,
        _order: data.orderId,
        _receipt: data.receiptId,
        _request: data.requestId,
        _reason: data.reason,
      },
    );
  });
export const getPurchaseOrderActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; orderId: string }) => ({
    companyId: assertUuid(input.companyId),
    orderId: assertUuid(input.orderId, "order"),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "purchases.view");
    return workflowRpc<PurchaseOrderActivity>(context.supabase, "get_purchase_order_activity", {
      _company: data.companyId,
      _order: data.orderId,
    });
  });
