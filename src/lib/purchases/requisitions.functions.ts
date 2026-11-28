import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import {
  assertOrderDate,
  validatePurchaseOrderLines,
  type PurchaseOrderLineInput,
} from "./purchase-order";

export const requisitionStatuses = [
  "draft",
  "pending",
  "approved",
  "rejected",
  "cancelled",
  "ordered",
] as const;
export type RequisitionStatus = (typeof requisitionStatuses)[number];
export type Requisition = {
  id: string;
  requisition_number: string;
  title: string;
  justification: string;
  contact_id: string;
  requested_on: string;
  required_on: string | null;
  currency_code: string;
  lines: PurchaseOrderLineInput[];
  subtotal_minor: number;
  tax_minor: number;
  total_minor: number;
  status: RequisitionStatus;
  version: number;
  created_by: string;
  submitted_by: string | null;
  approved_by: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  decision_comment: string | null;
  order_id: string | null;
};
export type SaveRequisitionInput = {
  companyId: string;
  id?: string;
  version?: number;
  requestId: string;
  title: string;
  justification?: string;
  contactId: string;
  requestedOn: string;
  requiredOn?: string;
  currencyCode: string;
  lines: PurchaseOrderLineInput[];
};
export type RequisitionAction = "submit" | "approve" | "reject" | "reset" | "cancel" | "convert";
function version(value: number | undefined) {
  if (!Number.isSafeInteger(value) || value! < 1)
    throw new Error("Reload the requisition before changing it");
  return value!;
}
function mutationError(error: { message: string; code?: string }) {
  if (error.code === "PGRST202" || error.code === "42P01")
    throw new Error(
      "The purchase requisition migration must be applied before using this workflow",
    );
  throw new Error(error.message);
}
export const listPurchaseRequisitions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      companyId: string;
      status?: RequisitionStatus | "all";
      search?: string;
      page?: number;
    }) => {
      const status = input.status ?? "all";
      if (status !== "all" && !requisitionStatuses.includes(status))
        throw new Error("Invalid requisition status");
      const page = input.page ?? 1;
      if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new Error("Invalid page");
      return {
        companyId: assertUuid(input.companyId),
        status,
        search: (input.search ?? "").trim().slice(0, 100),
        page,
      };
    },
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "purchases.view");
    const { data: result, error } = await context.supabase.rpc(
      "browse_purchase_requisitions" as never,
      {
        _company: data.companyId,
        _status: data.status,
        _search: data.search,
        _page: data.page,
      } as never,
    );
    if (error) mutationError(error);
    return result as unknown as {
      rows: Requisition[];
      total: number;
      page: number;
      pageSize: number;
    };
  });
export const savePurchaseRequisition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: SaveRequisitionInput) => {
    const title = input.title.trim();
    if (title.length < 3 || title.length > 160)
      throw new Error("Enter a title from 3 to 160 characters");
    const currencyCode = input.currencyCode.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currencyCode)) throw new Error("Choose a currency");
    const requestedOn = assertOrderDate(input.requestedOn);
    const requiredOn = input.requiredOn ? assertOrderDate(input.requiredOn) : null;
    if (requiredOn && requiredOn < requestedOn)
      throw new Error("Required date cannot precede the request date");
    const justification = (input.justification ?? "").trim();
    if (justification.length > 4000)
      throw new Error("Justification must be at most 4000 characters");
    return {
      companyId: assertUuid(input.companyId),
      id: input.id ? assertUuid(input.id, "requisition") : null,
      version: input.id ? version(input.version) : null,
      requestId: assertUuid(input.requestId, "request"),
      title,
      justification,
      contactId: assertUuid(input.contactId, "supplier"),
      requestedOn,
      requiredOn,
      currencyCode,
      lines: validatePurchaseOrderLines(input.lines).map(
        ({ description, accountId, quantity, unitPriceMinor, discountMinor, taxRateBps }) => ({
          description,
          accountId,
          quantity,
          unitPriceMinor,
          discountMinor,
          taxRateBps,
        }),
      ),
    };
  })
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "purchases.draft");
    const { companyId, ...payload } = data;
    const { data: result, error } = await context.supabase.rpc(
      "save_purchase_requisition" as never,
      { _company: companyId, _payload: payload } as never,
    );
    if (error) mutationError(error);
    return result as unknown as Requisition;
  });
export const managePurchaseRequisition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      companyId: string;
      id: string;
      version: number;
      action: RequisitionAction;
      comment?: string;
    }) => {
      if (!["submit", "approve", "reject", "reset", "cancel", "convert"].includes(input.action))
        throw new Error("Invalid requisition action");
      const comment = (input.comment ?? "").trim();
      if (comment.length > 1000 || (input.action === "reject" && comment.length < 3))
        throw new Error("Give a rejection reason from 3 to 1000 characters");
      return {
        companyId: assertUuid(input.companyId),
        id: assertUuid(input.id, "requisition"),
        version: version(input.version),
        action: input.action,
        comment,
      };
    },
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(
      context.supabase,
      data.companyId,
      ["approve", "reject"].includes(data.action) ? "purchases.authorise" : "purchases.draft",
    );
    const { data: result, error } = await context.supabase.rpc(
      "manage_purchase_requisition" as never,
      {
        _company: data.companyId,
        _id: data.id,
        _version: data.version,
        _action: data.action,
        _comment: data.comment,
      } as never,
    );
    if (error) mutationError(error);
    return result as unknown as Requisition;
  });
