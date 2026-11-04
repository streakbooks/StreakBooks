/**
 * Configurable tax line math (minor units).
 * Rounding: half-up on tax component. Not jurisdiction-filing compliant by itself.
 */

export type TaxTreatment = "exclusive" | "inclusive";

export type TaxLineInput = {
  quantity: number;
  unit_price_minor: bigint | number;
  discount_minor?: bigint | number;
  tax_rate_bps: number;
  treatment: TaxTreatment;
};

export type TaxLineResult = {
  net_minor: bigint;
  tax_minor: bigint;
  gross_minor: bigint;
};

function asBig(v: bigint | number | undefined): bigint {
  if (v === undefined) return 0n;
  if (typeof v === "number") {
    if (!Number.isSafeInteger(v)) {
      throw new Error(
        "Money amounts must be safe integer minor units; use bigint for larger values",
      );
    }
    return BigInt(v);
  }
  return v;
}

function halfUpDiv(numer: bigint, denom: bigint): bigint {
  if (denom <= 0n) throw new Error("Invalid divisor");
  if (numer >= 0n) return (numer + denom / 2n) / denom;
  return -((-numer + denom / 2n) / denom);
}

/** Extended amount after qty × unit − discount (exclusive base or inclusive gross). */
function extendedMinor(input: TaxLineInput): bigint {
  if (!(input.quantity > 0) || !Number.isFinite(input.quantity)) {
    throw new Error("Quantity must be a positive number");
  }
  // Six fractional places are supported by the existing posting calculation.
  // Reject extra precision instead of silently rounding the user's quantity.
  const scaled = input.quantity * 1_000_000;
  const nearest = Math.round(scaled);
  if (!Number.isSafeInteger(nearest) || nearest < 1 || Math.abs(scaled - nearest) > 0.000001) {
    throw new Error("Quantity must have at most six decimal places");
  }
  const unit = asBig(input.unit_price_minor);
  if (unit < 0n) throw new Error("Unit price cannot be negative");
  const discount = asBig(input.discount_minor);
  if (discount < 0n) throw new Error("Discount cannot be negative");
  const bps = input.tax_rate_bps;
  if (!Number.isInteger(bps) || bps < 0 || bps > 10000) {
    throw new Error("Tax rate must be 0–10000 basis points");
  }
  const qtyScaled = BigInt(nearest);
  const extended = (unit * qtyScaled) / 1_000_000n;
  const afterDiscount = extended - discount;
  if (afterDiscount < 0n) throw new Error("Discount exceeds line amount");
  return afterDiscount;
}

/**
 * Exclusive: price is net; tax = round(net * bps / 10000); gross = net + tax.
 * Inclusive: price is gross; net = round(gross * 10000 / (10000+bps)); tax = gross − net.
 */
export function computeTaxLine(input: TaxLineInput): TaxLineResult {
  if (input.treatment !== "exclusive" && input.treatment !== "inclusive") {
    throw new Error("Unknown tax treatment; choose inclusive or exclusive");
  }
  const amount = extendedMinor(input);
  const bps = BigInt(input.tax_rate_bps);

  if (input.treatment === "exclusive") {
    const tax = halfUpDiv(amount * bps, 10000n);
    return { net_minor: amount, tax_minor: tax, gross_minor: amount + tax };
  }

  // inclusive
  if (bps === 0n) {
    return { net_minor: amount, tax_minor: 0n, gross_minor: amount };
  }
  const net = halfUpDiv(amount * 10000n, 10000n + bps);
  const tax = amount - net;
  return { net_minor: net, tax_minor: tax, gross_minor: amount };
}

export function isRateEffective(
  rate: { effective_from: string; effective_to: string | null; is_active: boolean },
  onDate: string,
): boolean {
  if (!rate.is_active) return false;
  if (onDate < rate.effective_from) return false;
  if (rate.effective_to && onDate > rate.effective_to) return false;
  return true;
}

export {
  SUPPORTED_TAX_PACKS,
  TAX_COUNTRY_PACKS,
  packsForCountry,
  suggestedRegimeForCountry,
  verificationStatusLabel,
  packById,
} from "@/lib/tax/country-packs";

/** Tax treatments are not interchangeable — reporting/classification differs even at 0 bps. */
export type TaxCodeTreatment =
  "standard" | "reduced" | "zero_rated" | "exempt" | "outside_scope" | "no_tax" | "reverse_charge";

export function taxPostsToControlAccount(treatment: string, taxMinor: bigint): boolean {
  if (taxMinor === 0n) {
    // Zero-rated may still be reportable; exempt/outside_scope/no_tax do not create control movements from zero tax.
    return false;
  }
  if (treatment === "exempt" || treatment === "outside_scope" || treatment === "no_tax") {
    return false;
  }
  return true;
}

export function bpsToPercentLabel(rateBps: number): string {
  return `${(rateBps / 100).toFixed(rateBps % 100 === 0 ? 0 : 2)}%`;
}
