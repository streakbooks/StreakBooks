import type { TaxTreatment } from "@/lib/tax/tax-math";
import { assertUuid } from "@/lib/company-validation";
import { parseMinorOrThrow } from "@/lib/purchases/money-input";
import type { PurchaseOrderLineForm, PurchaseOrderLineInput } from "@/lib/purchases/purchase-order";
import { extendedAmountMinor } from "./line-math-rounded";
import { validateSalesLines, sumLines } from "./line-helpers";
export function validateSalesOrderLineInputs(lines: PurchaseOrderLineInput[]) {
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > 200)
    throw new Error("Add between 1 and 200 order lines");
  return lines.map((line, i) => {
    const description = line.description.trim();
    const price = line.unitPriceMinor,
      discount = line.discountMinor ?? 0,
      tax = line.taxRateBps ?? 0;
    if (
      !description ||
      description.length > 2000 ||
      !Number.isFinite(line.quantity) ||
      line.quantity <= 0 ||
      line.quantity > 1e9 ||
      line.quantity !== Number(line.quantity.toFixed(6)) ||
      !Number.isSafeInteger(price) ||
      price < 0 ||
      !Number.isSafeInteger(discount) ||
      discount < 0 ||
      !Number.isInteger(tax) ||
      tax < 0 ||
      tax > 10000
    )
      throw new Error(`Line ${i + 1}: check description, quantity, price, discount and tax`);
    if (BigInt(discount) > extendedAmountMinor(line.quantity, price))
      throw new Error(`Line ${i + 1}: discount exceeds line amount`);
    return {
      description,
      accountId: assertUuid(line.accountId, "account"),
      quantity: line.quantity,
      unitPriceMinor: price,
      discountMinor: discount,
      taxRateBps: tax,
    };
  });
}
export function salesOrderLinesFromForm(
  lines: PurchaseOrderLineForm[],
  currency: string,
  treatment: TaxTreatment,
) {
  const inputs = validateSalesOrderLineInputs(
    lines.map((line) => {
      const tax = Number(line.taxPercent);
      if (!line.taxPercent.trim() || !Number.isFinite(tax) || tax !== Number(tax.toFixed(2)))
        throw new Error("Enter tax percentages with up to two decimal places");
      return {
        description: line.description,
        accountId: line.accountId,
        quantity: Number(line.quantity),
        unitPriceMinor: Number(parseMinorOrThrow(line.unitPrice, currency)),
        discountMinor: Number(parseMinorOrThrow(line.discount, currency)),
        taxRateBps: Math.round(tax * 100),
      };
    }),
  );
  const computed = validateSalesLines(inputs, { treatment });
  if (sumLines(computed).total_minor > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("Order total exceeds the supported range");
  return computed;
}
