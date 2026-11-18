/**
 * Purchase-order three-way match (order × received × bill).
 * Original LinkBooks rules — public 3-way matching concepts only; no competitor code.
 *
 * Matching is operational/control. Journals still post only through bill authorisation.
 * When the company enables purchases.three_way_matching, authorisation must fail closed
 * until order, receipt and bill agree (or the feature is turned off).
 */

export type ThreeWayOrderLine = {
  lineNo: number;
  description: string;
  accountId: string;
  quantity: number;
  quantityReceived: number | null;
  netMinor: number;
};

export type ThreeWayBillLine = {
  lineNo: number;
  description: string;
  accountId: string;
  quantity: number;
  netMinor: number;
};

export type ThreeWayLineVerdict = {
  lineNo: number;
  description: string;
  orderedQuantity: number;
  receivedQuantity: number | null;
  billedQuantity: number;
  orderedNetMinor: number;
  billedNetMinor: number;
  status: "pass" | "fail" | "incomplete";
  detail: string;
};

export type ThreeWayMatchResult = {
  /** False when the bill is not linked to a purchase order. */
  applicable: boolean;
  status: "pass" | "fail" | "incomplete" | "na";
  issues: string[];
  lines: ThreeWayLineVerdict[];
  totals: {
    orderedQuantity: number;
    receivedQuantity: number | null;
    billedQuantity: number;
    orderedNetMinor: number;
    billedNetMinor: number;
  };
};

function qty(value: number, label: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n !== Number(n.toFixed(6))) {
    throw new Error(`${label}: quantities must be finite with up to six decimal places`);
  }
  return n;
}

function minor(value: number, label: string): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new Error(`${label}: amount is out of range`);
  return n;
}

function round6(n: number): number {
  return Number(n.toFixed(6));
}

/**
 * Pair each bill line to one order line with the same description and account.
 * Prefer its line number, but allow renumbered partial bills. Unbilled order lines are allowed.
 */
export function evaluateThreeWayMatch(input: {
  orderLines: ThreeWayOrderLine[];
  billLines: ThreeWayBillLine[];
  /** False when quantity_received cannot be read (migration not applied). */
  receiptQuantitiesAvailable: boolean;
}): ThreeWayMatchResult {
  if (!Array.isArray(input.orderLines) || input.orderLines.length < 1) {
    return {
      applicable: true,
      status: "incomplete",
      issues: ["Purchase order has no lines to match against."],
      lines: [],
      totals: {
        orderedQuantity: 0,
        receivedQuantity: null,
        billedQuantity: 0,
        orderedNetMinor: 0,
        billedNetMinor: 0,
      },
    };
  }

  const orderByNo = new Map<number, ThreeWayOrderLine>();
  for (const line of input.orderLines) {
    if (orderByNo.has(line.lineNo)) {
      throw new Error("Purchase order line numbers must be unique for three-way matching");
    }
    orderByNo.set(line.lineNo, line);
  }

  const usedOrder = new Set<number>();
  const verdicts: ThreeWayLineVerdict[] = [];
  const issues: string[] = [];

  if (!input.receiptQuantitiesAvailable) {
    issues.push(
      "Goods receipt quantities are unavailable. Apply the purchase-order goods receipt migration or turn off three-way matching.",
    );
  }

  const sortedBill = [...input.billLines].sort((a, b) => a.lineNo - b.lineNo);
  for (const bill of sortedBill) {
    const matches = (candidate: ThreeWayOrderLine) =>
      !usedOrder.has(candidate.lineNo) &&
      candidate.accountId === bill.accountId &&
      candidate.description.trim().toLowerCase() === bill.description.trim().toLowerCase();
    let order = orderByNo.get(bill.lineNo);
    if (!order || !matches(order)) {
      order = input.orderLines.find(matches);
    }
    if (!order) {
      const detail = `Bill line ${bill.lineNo} has no matching purchase-order line.`;
      issues.push(detail);
      verdicts.push({
        lineNo: bill.lineNo,
        description: bill.description,
        orderedQuantity: 0,
        receivedQuantity: null,
        billedQuantity: qty(bill.quantity, `Bill line ${bill.lineNo}`),
        orderedNetMinor: 0,
        billedNetMinor: minor(bill.netMinor, `Bill line ${bill.lineNo} net`),
        status: "fail",
        detail,
      });
      continue;
    }
    usedOrder.add(order.lineNo);

    const orderedQuantity = qty(order.quantity, `Order line ${order.lineNo}`);
    const billedQuantity = qty(bill.quantity, `Bill line ${bill.lineNo}`);
    const orderedNetMinor = minor(order.netMinor, `Order line ${order.lineNo} net`);
    const billedNetMinor = minor(bill.netMinor, `Bill line ${bill.lineNo} net`);
    const receivedRaw = input.receiptQuantitiesAvailable ? order.quantityReceived : null;
    const receivedQuantity =
      receivedRaw == null ? null : qty(receivedRaw, `Order line ${order.lineNo} received`);

    let status: ThreeWayLineVerdict["status"] = "pass";
    const parts: string[] = [];

    if (receivedQuantity === null) {
      status = "incomplete";
      parts.push("received quantity missing");
    } else if (round6(receivedQuantity) < round6(billedQuantity)) {
      status = "fail";
      parts.push(`billed quantity ${billedQuantity} exceeds received ${receivedQuantity}`);
    }

    if (round6(billedQuantity) > round6(orderedQuantity)) {
      status = "fail";
      parts.push(`billed quantity ${billedQuantity} exceeds ordered ${orderedQuantity}`);
    }

    if (billedNetMinor !== orderedNetMinor || round6(billedQuantity) < round6(orderedQuantity)) {
      // Allow under-billing (partial bill) when quantities also under-bill proportionally is complex;
      // fail closed on net mismatch unless billed qty matches a strict partial of order net by qty ratio.
      if (round6(billedQuantity) === round6(orderedQuantity)) {
        status = "fail";
        parts.push("billed net amount differs from ordered net for a full-quantity line");
      } else if (round6(billedQuantity) < round6(orderedQuantity)) {
        const expected = Math.round((orderedNetMinor * billedQuantity) / orderedQuantity);
        if (billedNetMinor !== expected) {
          status = "fail";
          parts.push("billed net amount does not match the ordered rate for the billed quantity");
        }
      }
    }

    if (receivedQuantity !== null && round6(receivedQuantity) > round6(orderedQuantity)) {
      status = "fail";
      parts.push("received quantity exceeds ordered quantity");
    }

    const detail =
      status === "pass" ? "Order, receipt and bill quantities/amounts agree." : parts.join("; ");
    if (status !== "pass") issues.push(`Line ${order.lineNo}: ${detail}`);

    verdicts.push({
      lineNo: order.lineNo,
      description: order.description,
      orderedQuantity,
      receivedQuantity,
      billedQuantity,
      orderedNetMinor,
      billedNetMinor,
      status,
      detail,
    });
  }

  for (const order of input.orderLines) {
    if (usedOrder.has(order.lineNo)) continue;
    // Unbilled order lines are allowed for partial billing; they do not fail the match.
    // They only fail when three-way requires full receipt before any bill and nothing was billed for them — no.
  }

  const orderedQuantity = input.orderLines.reduce((s, l) => s + qty(l.quantity, "Order"), 0);
  const billedQuantity = input.billLines.reduce((s, l) => s + qty(l.quantity, "Bill"), 0);
  const orderedNetMinor = input.orderLines.reduce((s, l) => s + minor(l.netMinor, "Order net"), 0);
  const billedNetMinor = input.billLines.reduce((s, l) => s + minor(l.netMinor, "Bill net"), 0);
  let receivedQuantity: number | null = null;
  if (input.receiptQuantitiesAvailable) {
    receivedQuantity = input.orderLines.reduce(
      (s, l) => s + qty(l.quantityReceived ?? 0, "Received"),
      0,
    );
  }

  if (verdicts.length === 0 && input.billLines.length === 0) {
    issues.push("Bill has no lines to match.");
  }

  let status: ThreeWayMatchResult["status"] = "pass";
  if (verdicts.some((v) => v.status === "fail")) status = "fail";
  else if (
    !input.receiptQuantitiesAvailable ||
    verdicts.some((v) => v.status === "incomplete") ||
    (verdicts.length === 0 && input.billLines.length === 0)
  ) {
    status = "incomplete";
  }

  return {
    applicable: true,
    status,
    issues: [...new Set(issues)],
    lines: verdicts,
    totals: {
      orderedQuantity: round6(orderedQuantity),
      receivedQuantity: receivedQuantity == null ? null : round6(receivedQuantity),
      billedQuantity: round6(billedQuantity),
      orderedNetMinor,
      billedNetMinor,
    },
  };
}

export function notApplicableMatch(): ThreeWayMatchResult {
  return {
    applicable: false,
    status: "na",
    issues: [],
    lines: [],
    totals: {
      orderedQuantity: 0,
      receivedQuantity: null,
      billedQuantity: 0,
      orderedNetMinor: 0,
      billedNetMinor: 0,
    },
  };
}

/** Fail closed when the company requires three-way matching. */
export function assertThreeWayMatchForAuthorise(
  result: ThreeWayMatchResult,
  required: boolean,
): void {
  if (!required || !result.applicable) return;
  if (result.status === "pass") return;
  if (result.status === "incomplete") {
    throw new Error(
      result.issues[0] ??
        "Three-way matching is incomplete. Receive goods and ensure the bill matches the order before authorising.",
    );
  }
  throw new Error(
    result.issues[0] ??
      "Three-way matching failed. Correct order, receipt or bill quantities/amounts before authorising.",
  );
}
