/** Provider data, never a browser assertion, establishes payment ownership. */
export type RefundPayment = {
  customer?: string;
  currency?: string;
  status?: string;
  amount_received?: number;
};
export function assertRefundPayment(
  payment: RefundPayment,
  customer: { provider_customer_id: string; currency: string },
  amountMinor: number,
): void {
  if (
    !Number.isSafeInteger(amountMinor) ||
    amountMinor < 1 ||
    payment.customer !== customer.provider_customer_id ||
    payment.currency?.toUpperCase() !== customer.currency.trim().toUpperCase() ||
    payment.status !== "succeeded" ||
    amountMinor > (payment.amount_received ?? 0)
  )
    throw new Error(
      "The payment must belong to this business, match its currency and have a captured amount covering the refund.",
    );
}
