import { decimalPlacesFor, toMinorUnits } from "@/lib/accounting/money";
import { extendedAmountMinor } from "@/lib/sales/line-math-rounded";
import { computeLineAmounts } from "@/lib/purchases/line-math";
import { getImportDefinition } from "./import-definitions";
import { previewImportCsv } from "./import-preflight";

export type TransactionImportKind = "sales" | "purchases";
export type TransactionImportLine = {
  sourceRow: number;
  documentNumber: string;
  contactName: string;
  documentDate: string;
  dueDate: string;
  accountCode: string;
  description: string;
  quantity: number;
  unitPriceMinor: number;
  taxCode: string | null;
};
export type TransactionImportDocument = {
  documentNumber: string;
  contactName: string;
  documentDate: string;
  dueDate: string;
  lines: TransactionImportLine[];
};

/** Strict calendar validation; Date.parse normalises impossible dates on some runtimes. */
function date(value: string, row: number, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Row ${row}: invalid ${label}`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`Row ${row}: invalid ${label}`);
  }
  return value;
}

function price(value: string, currency: string, row: number): number {
  if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(value)) {
    throw new Error(`Row ${row}: unit price must be a non-negative decimal`);
  }
  if ((value.split(".")[1] ?? "").length > decimalPlacesFor(currency)) {
    throw new Error(`Row ${row}: unit price exceeds ${currency} precision`);
  }
  const units = toMinorUnits(value, currency);
  if (units > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`Row ${row}: unit price exceeds safe integer range`);
  }
  return Number(units);
}

/**
 * Apply the SAME quantity rounding as the authorised Sales/Purchases engines.
 * Sales rounds half-up, whereas Purchases currently truncates extended minor units.
 * Do not estimate financial limits using floating-point multiplication.
 */
function lineValueMinor(kind: TransactionImportKind, line: Pick<TransactionImportLine, "quantity" | "unitPriceMinor">): bigint {
  return kind === "sales"
    ? extendedAmountMinor(line.quantity, line.unitPriceMinor)
    : computeLineAmounts({ quantity: line.quantity, unit_price_minor: line.unitPriceMinor, tax_rate_bps: 0 }).net_minor;
}

/**
 * Full-file, read-only validation for invoice/bill line imports.
 *
 * This does NOT post documents. An authenticated server writer must still resolve
 * company-scoped contacts/accounts/tax codes, check duplicates, persist drafts,
 * and call the authorised domain posting services.
 */
export function prepareTransactionCsv(
  csvText: string, kind: TransactionImportKind, currency: string,
): TransactionImportDocument[] {
  if (csvText.length > 5 * 1024 * 1024) throw new Error("CSV exceeds 5 MB");
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Invalid currency");
  const def = getImportDefinition(kind, kind === "sales" ? "Invoices" : "Bills");
  const preview = previewImportCsv(csvText, def, { maxRows: 250 });
  if (preview.issues.length) {
    const problem = preview.issues[0]!;
    throw new Error(`Row ${problem.row}: ${problem.message}`);
  }
  if (!preview.records.length) throw new Error("CSV has no document lines");
  const documents = new Map<string, TransactionImportDocument>();
  for (const { sourceRow, values: v } of preview.records) {
    const documentNumber = (v[kind === "sales" ? "invoice_number" : "bill_number"] ?? "").trim();
    const contactName = (v[kind === "sales" ? "customer" : "supplier"] ?? "").trim();
    const documentDate = date(v[kind === "sales" ? "invoice_date" : "bill_date"] ?? "", sourceRow, "document date");
    const dueDate = date(v["due_date"] ?? "", sourceRow, "due date");
    if (dueDate < documentDate) throw new Error(`Row ${sourceRow}: due date precedes document date`);
    if (documentNumber.length > 80 || contactName.length > 200) {
      throw new Error(`Row ${sourceRow}: document number or contact name too long`);
    }
    const accountCode = (v["account_code"] ?? "").trim();
    if (accountCode.length > 40 || !/^[A-Za-z0-9._-]+$/.test(accountCode)) {
      throw new Error(`Row ${sourceRow}: invalid account code`);
    }
    const description = (v["description"] ?? "").trim();
    if (description.length > 500) throw new Error(`Row ${sourceRow}: description too long`);
    const quantityText = v["quantity"] ?? "";
    if (!/^(0|[1-9]\d*)(\.\d{1,4})?$/.test(quantityText)) {
      throw new Error(`Row ${sourceRow}: quantity must be a non-negative decimal (max 4 places)`);
    }
    const quantity = Number(quantityText);
    if (!Number.isSafeInteger(Math.round(quantity * 10000)) || quantity <= 0) {
      throw new Error(`Row ${sourceRow}: quantity must be positive and within the safe range`);
    }
    const unitPriceMinor = price(v["unit_price"] ?? "", currency, sourceRow);
    if (lineValueMinor(kind, { quantity, unitPriceMinor }) > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(`Row ${sourceRow}: extended line amount exceeds safe integer range`);
    }
    const taxCode = (v["tax_code"] ?? "").trim() || null;
    if (taxCode && taxCode.length > 80) throw new Error(`Row ${sourceRow}: tax code too long`);
    const line: TransactionImportLine = {
      sourceRow, documentNumber, contactName, documentDate, dueDate,
      accountCode, description, quantity, unitPriceMinor, taxCode,
    };
    const key = kind === "sales" ? documentNumber.toLocaleLowerCase("en-US")
      : JSON.stringify([contactName.toLocaleLowerCase("en-US"), documentNumber.toLocaleLowerCase("en-US")]);
    const prior = documents.get(key);
    if (prior) {
      if (prior.contactName !== contactName || prior.documentDate !== documentDate || prior.dueDate !== dueDate) {
        throw new Error(`Row ${sourceRow}: conflicting header for document ${documentNumber}`);
      }
      prior.lines.push(line);
    } else {
      documents.set(key, { documentNumber, contactName, documentDate, dueDate, lines: [line] });
    }
  }
  // A document can overflow even when each individual line fits in a safe JS integer.
  // Validate the whole file BEFORE any domain writer can create a partial import.
  for (const doc of documents.values()) {
    let documentMinor = 0n;
    for (const line of doc.lines) {
      documentMinor += lineValueMinor(kind, line);
      if (documentMinor > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error(`Row ${line.sourceRow}: document ${doc.documentNumber} total exceeds safe integer range`);
      }
    }
    if (documentMinor === 0n) {
      throw new Error(`Row ${doc.lines[0]!.sourceRow}: document ${doc.documentNumber} has no monetary value after line rounding`);
    }
  }
  return [...documents.values()];
}
