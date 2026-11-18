/**
 * Server-side loader for purchase-order three-way match.
 * Keeps Supabase I/O out of the pure match maths module.
 */
import type { assertCompanyPermission } from "@/lib/assert-company-access";
import { workflowRpc } from "@/lib/workflows-rpc.server";
import { defaultDocumentFor, purchasesConfigSchema } from "@/lib/settings/registry";
import {
  evaluateThreeWayMatch,
  notApplicableMatch,
  type ThreeWayMatchResult,
} from "@/lib/purchases/po-three-way-match";

type Sb = Parameters<typeof assertCompanyPermission>[0];

export async function loadThreeWayMatchingRequired(
  supabase: Sb,
  companyId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("organisation_config" as never)
    .select("document" as never)
    .eq("company_id" as never, companyId as never)
    .eq("category" as never, "purchases" as never)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const raw =
    data && typeof data === "object" && data !== null && "document" in data
      ? (data as { document: unknown }).document
      : defaultDocumentFor("purchases");
  const parsed = purchasesConfigSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data.three_way_matching : false;
}

export async function loadBillThreeWayMatch(
  supabase: Sb,
  companyId: string,
  bill: {
    id?: string;
    purchase_order_id: string | null | undefined;
    purchase_bill_lines: Array<{
      line_no?: number | null;
      description: string;
      account_id: string | null;
      quantity: number;
      net_minor: number;
    }>;
  },
): Promise<ThreeWayMatchResult> {
  const orderId = bill.purchase_order_id ? String(bill.purchase_order_id) : "";
  if (!orderId) return notApplicableMatch();

  // Persisted PO bills use stable source line identities and cumulative allocations
  // across every active linked bill. Per-bill proportional math cannot validate
  // final rounding residuals or quantities released by deleted/void bills.
  if (bill.id) {
    return workflowRpc<ThreeWayMatchResult>(supabase, "validate_purchase_order_bill", {
      _company: companyId,
      _bill: bill.id,
    });
  }

  let receiptQuantitiesAvailable = true;
  type OrderRow = {
    line_no: number;
    description: string;
    account_id: string;
    quantity: number;
    quantity_received?: number | null;
    net_minor: number;
  };
  let orderRows: OrderRow[] = [];

  const first = await supabase
    .from("purchase_order_lines" as never)
    .select("line_no, description, account_id, quantity, quantity_received, net_minor" as never)
    .eq("company_id" as never, companyId as never)
    .eq("order_id" as never, orderId as never)
    .order("line_no" as never);
  if (first.error) {
    if (/quantity_received/i.test(first.error.message) || /42703/.test(first.error.message)) {
      receiptQuantitiesAvailable = false;
      const retry = await supabase
        .from("purchase_order_lines" as never)
        .select("line_no, description, account_id, quantity, net_minor" as never)
        .eq("company_id" as never, companyId as never)
        .eq("order_id" as never, orderId as never)
        .order("line_no" as never);
      if (retry.error) throw new Error(retry.error.message);
      orderRows = (retry.data as OrderRow[] | null) ?? [];
    } else {
      throw new Error(first.error.message);
    }
  } else {
    orderRows = (first.data as OrderRow[] | null) ?? [];
  }

  const billLines = [...bill.purchase_bill_lines]
    .map((line, index) => ({
      lineNo: Number(line.line_no ?? index + 1),
      description: line.description,
      accountId: line.account_id ?? "",
      quantity: Number(line.quantity),
      netMinor: Number(line.net_minor),
    }))
    .filter((line) => line.accountId);

  return evaluateThreeWayMatch({
    receiptQuantitiesAvailable,
    orderLines: orderRows.map((line) => ({
      lineNo: Number(line.line_no),
      description: line.description,
      accountId: line.account_id,
      quantity: Number(line.quantity),
      quantityReceived: receiptQuantitiesAvailable ? Number(line.quantity_received ?? 0) : null,
      netMinor: Number(line.net_minor),
    })),
    billLines,
  });
}
