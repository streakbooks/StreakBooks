/**
 * Portal payment rules shared by the server and unit tests.
 * The database function is the authority when a payment is created or settled.
 * These checks stop an invalid amount before that call and keep the hold list explicit.
 */

/** Statuses that reserve invoice balance before a receipt is posted. */
export const PORTAL_BALANCE_HOLD_STATUSES = [
  "requires_action",
  "processing",
  "sandbox_confirmed",
  "captured_unposted",
] as const;

export type PortalBalanceHoldStatus = (typeof PORTAL_BALANCE_HOLD_STATUSES)[number];

export function holdsInvoiceBalance(status: string): boolean {
  return (PORTAL_BALANCE_HOLD_STATUSES as readonly string[]).includes(status);
}

/** Room left for a new online payment after posted receipts and in-progress holds. */
export function payableRoom(outstandingMinor: number, heldMinor: number): number {
  if (!Number.isInteger(outstandingMinor) || !Number.isInteger(heldMinor)) return 0;
  return Math.max(0, outstandingMinor - Math.max(0, heldMinor));
}

export function assertPortalPaymentAmount(roomMinor: number, amountMinor: number): void {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new Error("Enter a payment amount greater than zero.");
  }
  if (!Number.isInteger(roomMinor) || amountMinor > roomMinor) {
    throw new Error(
      "That amount is more than the invoice still allows, including payments already in progress.",
    );
  }
}

export type PortalCheckoutMode = "stripe" | "razorpay" | "sandbox" | "instructions";

/**
 * Which checkout the server may open.
 * A live or test secret is never returned. Sandbox is an explicit organisation setting:
 * it posts a real receipt and does not collect card funds.
 */
export function resolvePortalCheckoutMode(input: {
  stripeSecretKey?: string | null | undefined;
  razorpayKeyId?: string | null | undefined;
  razorpayKeySecret?: string | null | undefined;
  allowSandbox: boolean;
}): { mode: PortalCheckoutMode; livemode: boolean } {
  const stripe = (input.stripeSecretKey ?? "").trim();
  if (stripe.startsWith("sk_live_") || stripe.startsWith("sk_test_")) {
    return { mode: "stripe", livemode: stripe.startsWith("sk_live_") };
  }
  const razorId = (input.razorpayKeyId ?? "").trim();
  const razorSecret = (input.razorpayKeySecret ?? "").trim();
  if (razorId && razorSecret) {
    return { mode: "razorpay", livemode: razorId.startsWith("rzp_live_") };
  }
  if (input.allowSandbox) return { mode: "sandbox", livemode: false };
  return { mode: "instructions", livemode: false };
}
