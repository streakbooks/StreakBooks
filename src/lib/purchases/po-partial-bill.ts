/**
 * Partial bill-from-received maths for purchase orders.
 * Original LinkBooks rules: bill only unbilled received quantities at the ordered rate.
 * Non-posting until the resulting draft bill is authorised through the existing engine.
 */

import { computeLineAmounts, sumLines } from "@/lib/purchases/line-math";
import { impliedDiscountMinor } from "@/lib/purchases/po-convert";

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
};

export type PartialBillDraftLine = {
  lineId: string;
  lineNo: number;
  description: string;
  accountId: string;
  quantity: number;
  unitPriceMinor: number;
  discountMinor: number;
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
    const fullDiscount = impliedDiscountMinor({
      quantity: ordered,
      unit_price_minor: line.unitPriceMinor,
      net_minor: line.netMinor,
    });
    const discountMinor = Math.floor((fullDiscount * billQty) / ordered);
    const computed = computeLineAmounts({
      quantity: billQty,
      unit_price_minor: line.unitPriceMinor,
      discount_minor: discountMinor,
      tax_rate_bps: line.taxRateBps,
    });
    draft.push({
      lineId: line.lineId,
      lineNo: line.lineNo,
      description: line.description,
      accountId: line.accountId,
      quantity: billQty,
      unitPriceMinor: line.unitPriceMinor,
      discountMinor,
      taxRateBps: line.taxRateBps,
      netMinor: Number(computed.net_minor),
      taxMinor: Number(computed.tax_minor),
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
