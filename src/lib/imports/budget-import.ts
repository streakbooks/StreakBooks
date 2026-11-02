import { decimalPlacesFor, toMinorUnits } from "@/lib/accounting/money";
import { getImportDefinition } from "./import-definitions";
import { previewImportCsv } from "./import-preflight";

export type BudgetImportRow = {
  sourceRow: number;
  accountCode: string;
  months: number[];
};

/** Read-only validation; must be executed again on the authenticated server before writing. */
export function prepareBudgetImportCsv(csvText: string, currency: string): BudgetImportRow[] {
  if (typeof csvText !== "string" || csvText.length > 5 * 1024 * 1024) {
    throw new Error("CSV is invalid or exceeds 5 MB");
  }
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Invalid currency");
  const def = getImportDefinition("budgets", "Monthly budget");
  const preview = previewImportCsv(csvText, def, { maxRows: 250 });
  if (preview.issues.length) {
    const issue = preview.issues[0]!;
    throw new Error(`Row ${issue.row}: ${issue.message}`);
  }
  if (!preview.records.length) throw new Error("CSV has no budget rows");
  const result: BudgetImportRow[] = [];
  const seen = new Set<string>();
  for (const { sourceRow, values } of preview.records) {
    const accountCode = (values["account_code"] ?? "").trim();
    if (!/^[A-Za-z0-9._-]{1,40}$/.test(accountCode)) {
      throw new Error(`Row ${sourceRow}: invalid account code`);
    }
    const key = accountCode.toLocaleLowerCase("en-US");
    if (seen.has(key))
      throw new Error(`Row ${sourceRow}: duplicate budget account code ${accountCode}`);
    seen.add(key);
    const months = Array.from({ length: 12 }, (_, index) => {
      const raw = (values[`month_${index + 1}`] ?? "").trim();
      if (!/^-?\d+(\.\d+)?$/.test(raw)) {
        throw new Error(`Row ${sourceRow}: month ${index + 1} is not a valid amount`);
      }
      const places = (raw.split(".")[1] ?? "").length;
      if (places > decimalPlacesFor(currency)) {
        throw new Error(
          `Row ${sourceRow}: month ${index + 1} exceeds ${currency} currency precision`,
        );
      }
      const minor = toMinorUnits(raw, currency);
      if (minor > BigInt(Number.MAX_SAFE_INTEGER) || minor < BigInt(Number.MIN_SAFE_INTEGER)) {
        throw new Error(`Row ${sourceRow}: month ${index + 1} exceeds safe integer range`);
      }
      return Number(minor);
    });
    result.push({ sourceRow, accountCode, months });
  }
  return result;
}
