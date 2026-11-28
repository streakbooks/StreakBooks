import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import {
  parseCompletePosCashSale,
  parsePosCashSaleResult,
  parsePosCashMovementResult,
  parsePosRecordCashMovement,
  parseRefundPosCashSale,
  parsePosRefundResult,
  type PosCompleteCashSaleInput,
  type PosRecordCashMovementInput,
  type PosRefundCashSaleInput,
} from "./cash-sale";

type Client = Parameters<typeof assertCompanyPermission>[0];

async function command(client: Client, name: string, args: Record<string, unknown>) {
  const { data, error } = await client.rpc(name as never, args as never);
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") {
      throw new Error(
        "POS cash sale database upgrade is not available. Ask your administrator to complete the reviewed migration.",
      );
    }
    throw new Error(error.message);
  }
  return data as unknown;
}

/** Retries must reuse the same operationId until the payload changes; see register session commands. */
export const completePosCashSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: PosCompleteCashSaleInput) => parseCompletePosCashSale(input))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "pos.sale.create");
    return parsePosCashSaleResult(
      await command(context.supabase, "pos_complete_cash_sale", {
        _company_id: data.companyId,
        _session_id: data.sessionId,
        _operation_id: data.operationId,
        _cash_tendered_minor: data.cashTenderedMinor,
        _lines: data.lines.map((line) => ({
          product_id: line.productId,
          quantity: line.quantity,
        })),
      }),
    );
  });

export const recordPosCashMovement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: PosRecordCashMovementInput) => parsePosRecordCashMovement(input))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "pos.cash.adjust");
    return parsePosCashMovementResult(
      await command(context.supabase, "pos_record_cash_movement", {
        _company_id: data.companyId,
        _session_id: data.sessionId,
        _operation_id: data.operationId,
        _kind: data.kind,
        _amount_minor: data.amountMinor,
        _note: data.note ?? null,
      }),
    );
  });

export const refundPosCashSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: PosRefundCashSaleInput) => parseRefundPosCashSale(input))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "pos.refund.create");
    return parsePosRefundResult(
      await command(context.supabase, "pos_refund_cash_sale", {
        _company_id: data.companyId,
        _sale_id: data.saleId,
        _operation_id: data.operationId,
      }),
    );
  });

export type PosRecentSale = {
  id: string;
  totalMinor: string;
  status: string;
  createdAt: string;
};

export const getPosRecentSales = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string }) => ({ companyId: assertUuid(input?.companyId) }))
  .handler(async ({ data, context }): Promise<PosRecentSale[]> => {
    await assertCompanyPermission(context.supabase, data.companyId, "pos.view");
    const { data: rows, error } = await context.supabase
      .from("pos_sales" as never)
      .select("id, total_minor, status, created_at" as never)
      .eq("company_id" as never, data.companyId as never)
      .order("created_at" as never, { ascending: false })
      .limit(10);
    if (error) {
      if (error.code === "PGRST205" || error.code === "42P01") {
        return [];
      }
      throw new Error(error.message);
    }
    return (rows ?? []).map((row) => {
      const sale = row as {
        id: string;
        total_minor: number | string;
        status: string;
        created_at: string;
      };
      return {
        id: sale.id,
        totalMinor: String(sale.total_minor),
        status: sale.status,
        createdAt: sale.created_at,
      };
    });
  });
