import { validateSalesOrderLineInputs } from "./sales-order-lines";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import {
  assertOrderDate,
  validatePurchaseOrderLines,
  type PurchaseOrderLineInput,
} from "@/lib/purchases/purchase-order";
import { workflowRpc } from "@/lib/workflows-rpc.server";
import { buildIlikeOr } from "@/lib/purchases/search-terms";
export type SalesOrder = {
  id: string;
  contact_id: string;
  order_number: string;
  order_date: string;
  currency_code: string;
  fx_rate_to_base: number;
  tax_inclusive: boolean;
  status: string;
  subtotal_minor: number;
  tax_minor: number;
  total_minor: number;
  memo: string | null;
  version: number;
  invoice_id: string | null;
  contacts: { name: string } | null;
  lines: Array<{
    description: string;
    account_id: string;
    quantity: number;
    unit_price_minor: number;
    discount_minor: number;
    tax_rate_bps: number;
    net_minor: number;
    tax_minor: number;
  }>;
};
export const listSalesOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; q?: string; status?: string; page?: number }) => ({
    companyId: assertUuid(input.companyId),
    q: (input.q ?? "").trim().slice(0, 100),
    status: input.status ?? "all",
    page: Math.min(100000, Math.max(1, Math.floor(input.page ?? 1))),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "sales.view");
    if (!["all", "draft", "confirmed", "cancelled", "invoiced"].includes(data.status))
      throw new Error("Invalid order status");
    let q = context.supabase
      .from("sales_orders" as never)
      .select("*,contacts(name)" as never, { count: "exact" })
      .eq("company_id" as never, data.companyId as never)
      .order("order_date" as never, { ascending: false })
      .order("id" as never, { ascending: false });
    if (data.status !== "all") q = q.eq("status" as never, data.status as never);
    const search = buildIlikeOr(["order_number", "memo"], data.q);
    if (search) q = q.or(search);
    const { data: rows, error, count } = await q.range((data.page - 1) * 25, data.page * 25 - 1);
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as unknown as SalesOrder[], total: count ?? 0 };
  });
export const getSalesOrder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; orderId: string }) => ({
    companyId: assertUuid(input.companyId),
    orderId: assertUuid(input.orderId, "order"),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "sales.view");
    const { data: row, error } = await context.supabase
      .from("sales_orders" as never)
      .select("*,contacts(name)" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("id" as never, data.orderId as never)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Sales order not found");
    return row as unknown as SalesOrder;
  });
export const saveSalesOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      companyId: string;
      requestId: string;
      contactId: string;
      orderDate: string;
      currencyCode: string;
      fxRate: number;
      memo: string;
      lines: PurchaseOrderLineInput[];
      orderId?: string;
      version?: number;
    }) => {
      // Purchasing validation is deliberately not used for sales amount calculation: sales rounds extended amounts half up in SQL.
      if (!Array.isArray(input.lines) || !input.lines.length || input.lines.length > 200)
        throw new Error("Add between 1 and 200 order lines");
      if (
        !/^[A-Z]{3}$/.test(input.currencyCode) ||
        !Number.isFinite(input.fxRate) ||
        input.fxRate <= 0
      )
        throw new Error("Enter a currency and positive exchange rate");
      return {
        ...input,
        lines: validateSalesOrderLineInputs(input.lines),
        companyId: assertUuid(input.companyId),
        requestId: assertUuid(input.requestId, "request"),
        contactId: assertUuid(input.contactId, "customer"),
        orderDate: assertOrderDate(input.orderDate),
        ...(input.orderId ? { orderId: assertUuid(input.orderId, "order") } : {}),
      };
    },
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "sales.draft");
    const { companyId, ...payload } = data;
    return workflowRpc<SalesOrder>(context.supabase, "save_sales_order", {
      _company: companyId,
      _payload: payload,
    });
  });
export const actSalesOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      companyId: string;
      orderId: string;
      version: number;
      action: "confirm" | "cancel" | "invoice";
      invoiceDate?: string;
    }) => {
      if (
        !["confirm", "cancel", "invoice"].includes(input.action) ||
        !Number.isSafeInteger(input.version) ||
        input.version < 1
      )
        throw new Error("Invalid order action; reload first");
      return {
        ...input,
        companyId: assertUuid(input.companyId),
        orderId: assertUuid(input.orderId, "order"),
        invoiceDate: input.action === "invoice" ? assertOrderDate(input.invoiceDate ?? "") : null,
      };
    },
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "sales.draft");
    return workflowRpc<{ id?: string; invoiceId: string | null }>(
      context.supabase,
      "act_sales_order",
      {
        _company: data.companyId,
        _order: data.orderId,
        _version: data.version,
        _action: data.action,
        _invoice_date: data.invoiceDate,
      },
    );
  });
