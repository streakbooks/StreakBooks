import { assertUuid } from "@/lib/company-validation";
import { parseMinorOrThrow } from "@/lib/purchases/money-input";
import { computeLineAmounts, sumLines } from "@/lib/purchases/line-math";

export type PurchaseOrderLineInput = {
  description: string;
  accountId: string;
  quantity: number;
  unitPriceMinor: number;
  discountMinor?: number;
  taxRateBps?: number;
};

export type PurchaseOrderLineForm = {
  description: string;
  accountId: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  taxPercent: string;
};

export const emptyOrderLine = (): PurchaseOrderLineForm => ({
  description: "",
  accountId: "",
  quantity: "1",
  unitPrice: "0.00",
  discount: "0",
  taxPercent: "0",
});

export function orderLinesFromForm(lines: PurchaseOrderLineForm[], currency: string) {
  return validatePurchaseOrderLines(
    lines.map((line, i) => ({
      description: line.description,
      accountId: line.accountId,
      quantity: Number(line.quantity),
      unitPriceMinor: Number(parseMinorOrThrow(line.unitPrice, currency, `Line ${i + 1} price`)),
      discountMinor: Number(parseMinorOrThrow(line.discount, currency, `Line ${i + 1} discount`)),
      taxRateBps: line.taxPercent.trim() ? Number(line.taxPercent) * 100 : Number.NaN,
    })),
  );
}

export function validatePurchaseOrderLines(lines: PurchaseOrderLineInput[]) {
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > 200)
    throw new Error("Add between 1 and 200 order lines");
  const result = lines.map((line, i) => {
    const label = `Line ${i + 1}`;
    const description = (line.description ?? "").trim();
    if (!description || description.length > 2000)
      throw new Error(`${label}: enter a description (up to 2000 characters)`);
    const accountId = assertUuid(line.accountId, `${label} account`);
    const quantity = Number(line.quantity);
    if (
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      quantity > 1e9 ||
      quantity !== Number(quantity.toFixed(6))
    )
      throw new Error(`${label}: enter a positive quantity with up to six decimal places`);
    const unitPriceMinor = Number(line.unitPriceMinor);
    const discountMinor = Number(line.discountMinor ?? 0);
    if (!Number.isSafeInteger(unitPriceMinor) || unitPriceMinor < 0)
      throw new Error(`${label}: enter a non-negative price within the supported range`);
    if (!Number.isSafeInteger(discountMinor) || discountMinor < 0)
      throw new Error(`${label}: enter a non-negative discount within the supported range`);
    const gross = (BigInt(unitPriceMinor) * BigInt(Math.round(quantity * 1e6))) / 1_000_000n;
    if (gross > BigInt(Number.MAX_SAFE_INTEGER) || BigInt(discountMinor) > gross)
      throw new Error(`${label}: discount cannot exceed the line amount`);
    const taxRateBps = Number(line.taxRateBps ?? 0);
    if (
      !Number.isFinite(taxRateBps) ||
      Math.abs(taxRateBps - Math.round(taxRateBps)) > 1e-7 ||
      taxRateBps < 0 ||
      taxRateBps > 10000
    )
      throw new Error(
        `${label}: enter a tax percentage from 0 to 100 with up to two decimal places`,
      );
    const computed = computeLineAmounts({
      quantity,
      unit_price_minor: unitPriceMinor,
      discount_minor: discountMinor,
      tax_rate_bps: Math.round(taxRateBps),
    });
    return {
      description,
      accountId,
      quantity,
      unitPriceMinor,
      discountMinor,
      taxRateBps: Math.round(taxRateBps),
      ...computed,
    };
  });
  if (sumLines(result).total_minor > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error("Order total exceeds the supported range");
  return result;
}

export function assertOrderDate(value: string): string {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(`${value}T12:00:00Z`)) ||
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value
  )
    throw new Error("Enter a valid order date");
  return value;
}

export function assertOrderStatusChange(
  status: string,
  billedBillId: string | null,
  next: "sent" | "cancelled",
) {
  if (
    billedBillId ||
    !["draft", "sent"].includes(status) ||
    (next === "sent" && status !== "draft")
  )
    throw new Error("This order can no longer be changed. Reload to see its current status.");
}
