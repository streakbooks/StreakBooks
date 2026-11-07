export type ExpenseRebillingMethod = "actual" | "markup" | "agreed_rate";

/** Compute the invoiceable minor amount for a billable expense line. */
export function calculateRebillNetMinor(input: {
  netMinor: number;
  method?: ExpenseRebillingMethod | null;
  markupBps?: number;
  agreedRateMinor?: number;
  quantity?: number;
}): number {
  if (!Number.isFinite(input.netMinor) || input.netMinor < 0) {
    throw new Error("Net amount must be non-negative.");
  }
  const method = input.method ?? "actual";
  if (method === "actual") return Math.round(input.netMinor);
  if (method === "markup") {
    const bps = input.markupBps ?? 0;
    if (!Number.isFinite(bps) || bps < 0) {
      throw new Error("Markup basis points must be non-negative.");
    }
    return Math.round(input.netMinor * (1 + bps / 10_000));
  }
  const qty = input.quantity ?? 1;
  const rate = input.agreedRateMinor ?? 0;
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error("Quantity must be greater than zero for agreed-rate rebilling.");
  }
  if (!Number.isFinite(rate) || rate < 0) {
    throw new Error("Agreed rate must be non-negative.");
  }
  return Math.round(qty * rate);
}

export function canPrepareClaimForRebilling(input: {
  rebillingStatus: string;
  rebillingInvoiceId: string | null;
  hasLines: boolean;
}): { ok: true } | { ok: false; error: string } {
  if (input.rebillingStatus === "invoiced" && input.rebillingInvoiceId) {
    return { ok: false, error: "Claim is already rebilled to an invoice." };
  }
  if (!input.hasLines) {
    return { ok: false, error: "Claim has no lines to rebill." };
  }
  return { ok: true };
}

export function buildRebillSalesLines(input: {
  lines: Array<{
    description: string;
    netMinor: number;
    isBillable?: boolean;
    rebillingMethod?: ExpenseRebillingMethod | null;
    quantity?: number;
  }>;
  incomeAccountId: string;
  markupBps?: number;
}):
  | {
      ok: true;
      lines: Array<{
        description: string;
        accountId: string;
        quantity: number;
        unitPriceMinor: number;
        taxRateBps: number;
      }>;
    }
  | { ok: false; error: string } {
  if (!input.incomeAccountId) {
    return { ok: false, error: "Rebilling income account is required." };
  }
  const billable = input.lines.filter((line) => line.isBillable !== false);
  if (billable.length === 0) {
    return { ok: false, error: "Mark at least one line as billable before rebilling." };
  }
  try {
    return {
      ok: true,
      lines: billable.map((line) => {
        const net = calculateRebillNetMinor({
          netMinor: line.netMinor,
          ...(line.rebillingMethod ? { method: line.rebillingMethod } : {}),
          ...(input.markupBps != null ? { markupBps: input.markupBps } : {}),
          ...(line.quantity != null ? { quantity: line.quantity } : { quantity: 1 }),
        });
        return {
          description: line.description,
          accountId: input.incomeAccountId,
          quantity: 1,
          unitPriceMinor: net,
          taxRateBps: 0,
        };
      }),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not build rebilling lines.",
    };
  }
}
