import { tryParseMinor } from "@/lib/purchases/money-input";
import { createEmptyDocumentLines } from "@/lib/ui/document-line-defaults";

export type SpendMoneyLine = {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
};

export function emptySpendMoneyLine(): SpendMoneyLine {
  return {
    id: crypto.randomUUID(),
    description: "",
    quantity: "1",
    unitPrice: "0.00",
  };
}

export function createSpendMoneyLines(count?: number): SpendMoneyLine[] {
  return createEmptyDocumentLines(emptySpendMoneyLine, count);
}

/** Roll spreadsheet lines into a single net minor amount for `saveAndPostExpense`. */
export function sumSpendMoneyLinesMinor(
  lines: readonly SpendMoneyLine[],
  currency: string,
): { netMinor: number | null; memoFromLines: string } {
  let total = 0;
  const descriptions: string[] = [];
  for (const line of lines) {
    const qty = Number(line.quantity);
    const unit = tryParseMinor(line.unitPrice || "0", currency);
    if (!Number.isFinite(qty) || unit === null) {
      return { netMinor: null, memoFromLines: "" };
    }
    total += Math.round(qty * Number(unit));
    const text = line.description.trim();
    if (text) descriptions.push(text);
  }
  return {
    netMinor: total,
    memoFromLines: descriptions.join("; ").slice(0, 500),
  };
}
