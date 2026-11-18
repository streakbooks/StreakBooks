/**
 * Partial bill-from-received maths for purchase orders.
 * Original LinkBooks rules: bill only unbilled received quantities at the ordered rate.
 * Non-posting until the resulting draft bill is authorised through the existing engine.
 */

import { sumLines } from "@/lib/purchases/line-math";

export type PartialBillOrderLine = {
  lineId: string;
  lineNo: number;
  description: string;
  accountId: string;
  orderedQuantity: number;
  quantityReceived: number;
  quantityBilled: number;
  unitPriceMinor: number;
  netMinor: number;
  taxRateBps: number;
  /** Actual non-void allocated amounts; needed after deletions or voids. */
  billedNetMinor?: number;
  billedTaxMinor?: number;
  taxMinor?: number;
};

export type PartialBillDraftLine = {
  lineId: string;
  lineNo: number;
  description: string;
  accountId: string;
  quantity: number;
  unitPriceMinor: number;
  discountMinor: number;
  roundingMinor: number;
  taxRoundingMinor: number;
  taxRateBps: number;
  netMinor: number;
  taxMinor: number;
};

function qty(value: number, label: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n !== Number(n.toFixed(6))) {
    throw new Error(`${label}: quantities must be finite with up to six decimal places`);
  }
  return n;
}

function safeMinor(value: number, label: string): bigint {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error(`${label}: amount is out of range`);
  return BigInt(value);
}

function micros(value: number, label: string): bigint {
  const n = qty(value, label);
  // Parse fixed decimal text rather than multiplying a binary float into an integer.
  return BigInt(n.toFixed(6).replace(".", ""));
}

/** Cumulative allocations preserve the exact order net and tax on final conversion. */
export function allocateReceivedLine(input: {
  orderedQuantity: number;
  billedQuantity: number;
  billQuantity: number;
  netMinor: number;
  taxMinor: number;
  billedNetMinor?: number;
  billedTaxMinor?: number;
  unitPriceMinor: number;
  taxRateBps: number;
}): Pick<
  PartialBillDraftLine,
  "discountMinor" | "roundingMinor" | "taxRoundingMinor" | "netMinor" | "taxMinor"
> {
  const ordered = micros(input.orderedQuantity, "Ordered quantity");
  const billed = micros(input.billedQuantity, "Billed quantity");
  const next = billed + micros(input.billQuantity, "Bill quantity");
  if (ordered <= 0n || next > ordered || next <= billed)
    throw new Error("Invalid cumulative bill quantity");
  if (!Number.isInteger(input.taxRateBps) || input.taxRateBps < 0 || input.taxRateBps > 10000)
    throw new Error("Invalid tax rate");
  const fullNet = safeMinor(input.netMinor, "Order net");
  const fullTax = safeMinor(input.taxMinor, "Order tax");
  const priorNet =
    input.billedNetMinor == null
      ? (fullNet * billed) / ordered
      : safeMinor(input.billedNetMinor, "Billed net");
  const priorTax =
    input.billedTaxMinor == null
      ? (fullTax * billed * 2n + ordered) / (ordered * 2n)
      : safeMinor(input.billedTaxMinor, "Billed tax");
  const net = (fullNet * next) / ordered - priorNet;
  const tax = (fullTax * next * 2n + ordered) / (ordered * 2n) - priorTax;
  if (net < 0n || tax < 0n)
    throw new Error("Prior bills exceed the cumulative order allocation; reconcile source bills");
  const extended =
    (micros(input.billQuantity, "Bill quantity") * safeMinor(input.unitPriceMinor, "Unit price")) /
    1000000n;
  const discount = extended > net ? extended - net : 0n;
  return {
    discountMinor: Number(discount),
    roundingMinor: Number(net - (extended - discount)),
    taxRoundingMinor: Number(tax - (net * BigInt(input.taxRateBps) * 2n + 10000n) / 20000n),
    netMinor: Number(net),
    taxMinor: Number(tax),
  };
}

/** Outstanding quantity that may be billed: min(received, ordered) − already billed. */
export function billableQuantity(line: {
  orderedQuantity: number;
  quantityReceived: number;
  quantityBilled: number;
}): number {
  const ordered = qty(line.orderedQuantity, "Ordered quantity");
  const received = qty(line.quantityReceived, "Received quantity");
  const billed = qty(line.quantityBilled, "Billed quantity");
  if (billed > ordered) throw new Error("Billed quantity cannot exceed ordered quantity");
  const receivable = Math.min(ordered, received);
  return Math.max(0, Number((receivable - billed).toFixed(6)));
}

export function assertCanBuildReceivedBill(input: {
  status: string;
  lines: PartialBillOrderLine[];
}): void {
  if (!["sent", "partially_received"].includes(input.status)) {
    throw new Error("Bill received goods only on sent or partially received purchase orders");
  }
  const any = input.lines.some((line) => billableQuantity(line) > 0);
  if (!any) {
    throw new Error(
      "Nothing to bill. Receive goods before converting, or all received quantities are already billed.",
    );
  }
}

/**
 * Build draft bill lines for currently billable received quantities.
 * Discount is pro-rated from the ordered line so unit economics stay consistent.
 */
export function buildReceivedBillLines(lines: PartialBillOrderLine[]): {
  lines: PartialBillDraftLine[];
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  fullyBilledAfter: boolean;
} {
  const draft: PartialBillDraftLine[] = [];
  for (const line of lines) {
    const billQty = billableQuantity(line);
    if (billQty <= 0) continue;
    const ordered = qty(line.orderedQuantity, "Ordered quantity");
    const allocation = allocateReceivedLine({
      orderedQuantity: ordered,
      billedQuantity: line.quantityBilled,
      billQuantity: billQty,
      netMinor: line.netMinor,
      taxMinor: line.taxMinor ?? Math.round((line.netMinor * line.taxRateBps) / 10000),
      ...(line.billedNetMinor === undefined ? {} : { billedNetMinor: line.billedNetMinor }),
      ...(line.billedTaxMinor === undefined ? {} : { billedTaxMinor: line.billedTaxMinor }),
      unitPriceMinor: line.unitPriceMinor,
      taxRateBps: line.taxRateBps,
    });
    draft.push({
      lineId: line.lineId,
      lineNo: line.lineNo,
      description: line.description,
      accountId: line.accountId,
      quantity: billQty,
      unitPriceMinor: line.unitPriceMinor,
      ...allocation,
      taxRateBps: line.taxRateBps,
    });
  }
  if (draft.length < 1) {
    throw new Error(
      "Nothing to bill. Receive goods before converting, or all received quantities are already billed.",
    );
  }
  const totals = sumLines(
    draft.map((l) => ({
      net_minor: BigInt(l.netMinor),
      tax_minor: BigInt(l.taxMinor),
      gross_minor: BigInt(l.netMinor + l.taxMinor),
    })),
  );
  const fullyBilledAfter = lines.every((line) => {
    const nextBilled = Number((line.quantityBilled + billableQuantity(line)).toFixed(6));
    return nextBilled + 1e-12 >= qty(line.orderedQuantity, "Ordered quantity");
  });
  return {
    lines: draft,
    subtotalMinor: Number(totals.subtotal_minor),
    taxMinor: Number(totals.tax_minor),
    totalMinor: Number(totals.total_minor),
    fullyBilledAfter,
  };
}

export function nextStatusAfterReceivedBill(fullyBilled: boolean): "billed" | "partially_received" {
  return fullyBilled ? "billed" : "partially_received";
}
