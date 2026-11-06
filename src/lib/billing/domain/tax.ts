import { divideRounded } from "./money";

/**
 * Tax arithmetic mirroring billing.inclusive_tax / billing.exclusive_tax. Rates are basis points;
 * amounts are minor units; one half-up rounding. The database computes invoices; this mirror lets
 * the checkout explain the amount before payment.
 */
export function inclusiveTax(grossMinor: bigint, rateBps: number): bigint {
  assertRate(rateBps);
  return grossMinor - divideRounded(grossMinor * 10000n, BigInt(10000 + rateBps), "HALF_UP");
}

export function exclusiveTax(netMinor: bigint, rateBps: number): bigint {
  assertRate(rateBps);
  return divideRounded(netMinor * BigInt(rateBps), 10000n, "HALF_UP");
}

/** Tax share of a partial credit, proportional to the invoice. */
export function proportionalTax(
  amountMinor: bigint,
  invoiceTaxMinor: bigint,
  invoiceTotalMinor: bigint,
): bigint {
  if (invoiceTotalMinor <= 0n) throw new Error("Invoice total must be positive");
  return divideRounded(amountMinor * invoiceTaxMinor, invoiceTotalMinor, "HALF_UP");
}

function assertRate(rateBps: number): void {
  if (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > 10000) {
    throw new Error("Tax rate must be 0 to 10000 basis points");
  }
}

export type CheckoutTax = {
  ruleId: string;
  label: string;
  rateBps: number;
  mode: "inclusive" | "exclusive";
  treatment: "standard" | "zero_rated" | "exempt" | "reverse_charge" | "not_collected";
  taxMinor: number;
  note: string | null;
};

/** Whether the provider must add tax on top of the price (exclusive, standard, non-zero). */
export function providerAddsTax(tax: CheckoutTax | null | undefined): boolean {
  return Boolean(
    tax && tax.mode === "exclusive" && tax.treatment === "standard" && tax.rateBps > 0,
  );
}
