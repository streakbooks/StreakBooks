export const MAX_PROMO_PERCENT_BPS = 5000;

const MONTHLY_FLOORS: Record<string, number> = {
  USD: 500,
  GBP: 400,
  AUD: 800,
  NZD: 800,
  INR: 9900,
};

export function assertPriceFloor(
  currency: string,
  interval: "month" | "year",
  amountMinor: number,
): void {
  const monthly = MONTHLY_FLOORS[currency] ?? 100;
  const floor = interval === "year" ? monthly * 8 : monthly;
  if (!Number.isInteger(amountMinor) || amountMinor < floor) {
    throw new Error(`That ${currency} price is below the floor of ${floor} minor units.`);
  }
}

export function assertDiscountCap(percentBps: number): void {
  if (percentBps > MAX_PROMO_PERCENT_BPS) {
    throw new Error("A promo cannot discount more than 50%.");
  }
}

export function planChangeKind(
  currentMinor: number,
  nextMinor: number,
): "upgrade" | "downgrade" | "same" {
  if (nextMinor > currentMinor) return "upgrade";
  if (nextMinor < currentMinor) return "downgrade";
  return "same";
}

export function stripePortalBody(customerId: string, returnUrl: string): URLSearchParams {
  const body = new URLSearchParams();
  body.set("customer", customerId);
  body.set("return_url", returnUrl);
  return body;
}

export function stripeRecurringPriceBody(input: {
  name: string;
  currency: string;
  interval: "month" | "year";
  amountMinor: number;
}): URLSearchParams {
  const body = new URLSearchParams();
  body.set("currency", input.currency.toLowerCase());
  body.set("unit_amount", String(input.amountMinor));
  body.set("recurring[interval]", input.interval);
  body.set("product_data[name]", input.name);
  return body;
}

export function stripeUpgradeBody(itemId: string, priceId: string): URLSearchParams {
  const body = new URLSearchParams();
  body.set("items[0][id]", itemId);
  body.set("items[0][price]", priceId);
  body.set("proration_behavior", "create_prorations");
  return body;
}

export function stripeRefundBody(
  paymentIntent: string,
  amountMinor: number,
  note: string,
): URLSearchParams {
  const body = new URLSearchParams();
  body.set("payment_intent", paymentIntent);
  body.set("amount", String(amountMinor));
  body.set("reason", "requested_by_customer");
  body.set("metadata[note]", note.slice(0, 200));
  return body;
}
