import { assertUuid } from "@/lib/company-validation";
import { computeTaxLineRounded } from "@/lib/sales/line-math-rounded";
import type { TaxTreatment } from "@/lib/tax/tax-math";

export type PosQuoteInput = { companyId: string; lines: { productId: string; quantity: number }[] };
export type PosCatalogueItem = {
  id: string;
  company_id: string;
  name: string;
  code: string | null;
  unit: string;
  is_active: boolean;
  sales_price_minor: number;
  sales_tax_rate_bps: number;
};

/** No caller-supplied prices, discounts, tax rates or payment state enter the preview. */
export function parsePosQuote(input: PosQuoteInput): PosQuoteInput {
  const companyId = assertUuid(input?.companyId);
  if (!Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > 100) {
    throw new Error("Choose between 1 and 100 cart lines");
  }
  return {
    companyId,
    lines: input.lines.map((line) => {
      const productId = assertUuid(line?.productId, "product");
      const quantity = line?.quantity;
      const scaled = quantity * 1_000_000;
      if (
        typeof quantity !== "number" ||
        !Number.isFinite(quantity) ||
        quantity <= 0 ||
        !Number.isSafeInteger(Math.round(scaled)) ||
        Math.abs(scaled - Math.round(scaled)) > 0.000001 ||
        Math.round(scaled) < 1
      ) {
        throw new Error("Quantity must be positive with at most six decimal places");
      }
      return { productId, quantity };
    }),
  };
}

/** Preview only. Checkout must re-read authoritative prices in its own atomic transaction. */
export function buildPosCatalogueQuote(
  rawInput: PosQuoteInput,
  products: readonly PosCatalogueItem[],
  currency: string,
  treatment: TaxTreatment,
) {
  const input = parsePosQuote(rawInput);
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Company currency is unavailable");
  if (treatment !== "inclusive" && treatment !== "exclusive")
    throw new Error("Invalid tax treatment");
  const byId = new Map(products.map((product) => [product.id, product]));
  let net = 0n;
  let tax = 0n;
  let gross = 0n;
  const lines = input.lines.map((line) => {
    const product = byId.get(line.productId);
    if (!product || product.company_id !== input.companyId || !product.is_active) {
      throw new Error("A cart item is unavailable for this organisation; refresh the catalogue");
    }
    if (!Number.isSafeInteger(product.sales_price_minor) || product.sales_price_minor < 0) {
      throw new Error("Catalogue price cannot be represented safely");
    }
    const amounts = computeTaxLineRounded({
      quantity: line.quantity,
      unit_price_minor: BigInt(product.sales_price_minor),
      tax_rate_bps: product.sales_tax_rate_bps,
      treatment,
    });
    net += amounts.net_minor;
    tax += amounts.tax_minor;
    gross += amounts.gross_minor;
    return {
      productId: product.id,
      name: product.name,
      code: product.code,
      unit: product.unit,
      quantity: line.quantity,
      unitPriceMinor: String(product.sales_price_minor),
      taxRateBps: product.sales_tax_rate_bps,
      netMinor: String(amounts.net_minor),
      taxMinor: String(amounts.tax_minor),
      grossMinor: String(amounts.gross_minor),
    };
  });
  return {
    companyId: input.companyId,
    currency,
    treatment,
    status: "preview" as const,
    pricingBasis: "catalogue" as const,
    lines,
    netMinor: String(net),
    taxMinor: String(tax),
    grossMinor: String(gross),
  };
}
