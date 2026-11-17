/**
 * Purchase-order goods receipt maths (non-posting).
 * Original LinkBooks rules: receiving updates quantities and operational status only.
 * No journal is created — bills still post through the existing conversion/authorise path.
 */

export type PoReceiptLineState = {
  lineId: string;
  orderedQuantity: number;
  quantityReceived: number;
};

export type PoReceiptDelta = {
  lineId: string;
  /** Additional quantity received in this action (not the cumulative total). */
  receiveQuantity: number;
};

function assertQuantity(value: number, label: string): number {
  if (
    !Number.isFinite(value) ||
    value <= 0 ||
    value > 1e9 ||
    value !== Number(value.toFixed(6))
  ) {
    throw new Error(`${label}: enter a positive quantity with up to six decimal places`);
  }
  return value;
}

export function remainingToReceive(line: PoReceiptLineState): number {
  const ordered = Number(line.orderedQuantity);
  const received = Number(line.quantityReceived);
  if (!Number.isFinite(ordered) || ordered <= 0) return 0;
  if (!Number.isFinite(received) || received < 0) return ordered;
  return Math.max(0, Number((ordered - received).toFixed(6)));
}

export function assertCanReceiveAgainstOrder(status: string, billedBillId: string | null): void {
  if (billedBillId) throw new Error("This order is already billed and cannot receive more goods");
  if (!["sent", "partially_received"].includes(status)) {
    throw new Error("Receive goods only on sent or partially received purchase orders");
  }
}

/**
 * Apply receipt deltas to line state and return the next cumulative quantities plus status.
 * Status stays `partially_received` once any goods are received until the order is billed
 * (the po_status enum has no separate fully-received value).
 */
export function applyPurchaseOrderReceipt(input: {
  status: string;
  billedBillId: string | null;
  lines: PoReceiptLineState[];
  deltas: PoReceiptDelta[];
}): { nextLines: PoReceiptLineState[]; nextStatus: "partially_received" } {
  assertCanReceiveAgainstOrder(input.status, input.billedBillId);
  if (!Array.isArray(input.deltas) || input.deltas.length < 1) {
    throw new Error("Add at least one receipt quantity");
  }

  const byId = new Map(input.lines.map((line) => [line.lineId, { ...line }]));
  const seen = new Set<string>();
  for (const delta of input.deltas) {
    if (seen.has(delta.lineId)) throw new Error("Each order line can appear once in a receipt");
    seen.add(delta.lineId);
    const line = byId.get(delta.lineId);
    if (!line) throw new Error("Receipt line does not belong to this purchase order");
    const receiveQuantity = assertQuantity(delta.receiveQuantity, "Receipt quantity");
    const remaining = remainingToReceive(line);
    if (receiveQuantity > remaining) {
      throw new Error("Cannot receive more than the outstanding ordered quantity");
    }
    line.quantityReceived = Number((line.quantityReceived + receiveQuantity).toFixed(6));
  }

  return {
    nextLines: [...byId.values()],
    nextStatus: "partially_received",
  };
}

/** Convenience: receive the full outstanding quantity on every line. */
export function receiveAllOutstanding(lines: PoReceiptLineState[]): PoReceiptDelta[] {
  return lines
    .map((line) => ({
      lineId: line.lineId,
      receiveQuantity: remainingToReceive(line),
    }))
    .filter((d) => d.receiveQuantity > 0);
}
