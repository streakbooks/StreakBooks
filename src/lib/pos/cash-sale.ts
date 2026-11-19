import { z } from "zod";
import { assertUuid } from "@/lib/company-validation";
import { parsePosQuote } from "./catalogue-quote";
import { parsePosMinor } from "./register-contracts";

const id = z.string().uuid();
const rpcMinor = z
  .string()
  .regex(/^(0|[1-9]\d*)$/)
  .refine((value) => BigInt(value) <= 9223372036854775807n);

/** Database JSON uses snake_case; map to UI-friendly camelCase. */
const posCashSaleRpcSchema = z.object({
  sale_id: id,
  operation_id: id,
  subtotal_minor: rpcMinor,
  tax_minor: rpcMinor,
  total_minor: rpcMinor,
  tendered_minor: rpcMinor,
  change_minor: rpcMinor,
  expected_cash_minor: rpcMinor,
  journal_id: id.nullable(),
});

export type PosCashSaleResult = {
  saleId: string;
  journalId: string | null;
  /** Durable client operation id until a dedicated receipt code exists server-side. */
  receiptCode: string;
  netMinor: string;
  taxMinor: string;
  grossMinor: string;
  cashTenderedMinor: string;
  changeMinor: string;
  expectedCashMinor: string;
};

export function parsePosCashSaleResult(raw: unknown): PosCashSaleResult {
  const row = posCashSaleRpcSchema.parse(raw);
  return {
    saleId: row.sale_id,
    journalId: row.journal_id,
    receiptCode: row.operation_id,
    netMinor: row.subtotal_minor,
    taxMinor: row.tax_minor,
    grossMinor: row.total_minor,
    cashTenderedMinor: row.tendered_minor,
    changeMinor: row.change_minor,
    expectedCashMinor: row.expected_cash_minor,
  };
}

const posCashMovementRpcSchema = z.object({
  movement_id: id,
  expected_cash_minor: rpcMinor,
});

export type PosCashMovementResult = {
  movementId: string;
  expectedCashMinor: string;
};

export function parsePosCashMovementResult(raw: unknown): PosCashMovementResult {
  const row = posCashMovementRpcSchema.parse(raw);
  return {
    movementId: row.movement_id,
    expectedCashMinor: row.expected_cash_minor,
  };
}

const posRefundRpcSchema = z.object({
  refund_id: id,
  sale_id: id,
  amount_minor: rpcMinor,
  expected_cash_minor: rpcMinor,
  journal_id: id.nullable(),
});

export type PosRefundResult = {
  refundId: string;
  saleId: string;
  amountMinor: string;
  expectedCashMinor: string;
  journalId: string | null;
};

export function parsePosRefundResult(raw: unknown): PosRefundResult {
  const row = posRefundRpcSchema.parse(raw);
  return {
    refundId: row.refund_id,
    saleId: row.sale_id,
    amountMinor: row.amount_minor,
    expectedCashMinor: row.expected_cash_minor,
    journalId: row.journal_id,
  };
}

export type PosCompleteCashSaleInput = {
  companyId: string;
  sessionId: string;
  operationId: string;
  cashTenderedMinor: string;
  lines: { productId: string; quantity: number }[];
};

export function parseCompletePosCashSale(
  input: PosCompleteCashSaleInput,
): PosCompleteCashSaleInput {
  const quote = parsePosQuote({ companyId: input.companyId, lines: input.lines });
  return {
    companyId: quote.companyId,
    sessionId: assertUuid(input.sessionId, "session"),
    operationId: assertUuid(input.operationId, "operation"),
    cashTenderedMinor: parsePosMinor(input.cashTenderedMinor),
    lines: quote.lines,
  };
}

export type PosRecordCashMovementInput = {
  companyId: string;
  sessionId: string;
  operationId: string;
  kind: "cash_in" | "cash_out";
  amountMinor: string;
  note?: string;
};

export function parsePosRecordCashMovement(
  input: PosRecordCashMovementInput,
): PosRecordCashMovementInput {
  const note =
    typeof input.note === "string" ? input.note.trim().slice(0, 500) || undefined : undefined;
  if (input.kind !== "cash_in" && input.kind !== "cash_out") {
    throw new Error("Choose cash in or cash out");
  }
  const amountMinor = parsePosMinor(input.amountMinor);
  if (amountMinor === "0") throw new Error("Amount must be greater than zero");
  return {
    companyId: assertUuid(input.companyId),
    sessionId: assertUuid(input.sessionId, "session"),
    operationId: assertUuid(input.operationId, "operation"),
    kind: input.kind,
    amountMinor,
    ...(note ? { note } : {}),
  };
}

export type PosRefundCashSaleInput = {
  companyId: string;
  saleId: string;
  operationId: string;
};

export function parseRefundPosCashSale(input: PosRefundCashSaleInput): PosRefundCashSaleInput {
  return {
    companyId: assertUuid(input.companyId),
    saleId: assertUuid(input.saleId, "sale"),
    operationId: assertUuid(input.operationId, "operation"),
  };
}
