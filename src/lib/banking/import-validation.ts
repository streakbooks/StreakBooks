import { parseDateValue } from "@/lib/banking/csv-mapping";

/** Strict server boundary for bank imports (CSV, OFX/QFX and QIF share this contract). */
export type ImportRowInput = {
  rowNumber: number;
  txnDate: string;
  amountMinor: number;
  description: string;
  reference: string | null;
  payee: string | null;
  externalId: string;
  force?: boolean;
};

const MAX_ROWS = 20_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function optionalText(
  value: unknown,
  maxLength: number,
  label: string,
  rowNumber: number,
): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new Error(`Row ${rowNumber}: invalid ${label}`);
  return value.trim().slice(0, maxLength) || null;
}

/**
 * Never coerce an untrusted amount or accept impossible calendar dates.
 * Use distinct IDs for identical legitimate transactions; duplicate source IDs
 * inside one request are ambiguous and must be reviewed before importing.
 */
export function validateBankImportRows(rows: unknown): ImportRowInput[] {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("There are no rows to import");
  }
  if (rows.length > MAX_ROWS) throw new Error(`At most ${MAX_ROWS} rows can be imported at once`);
  const seenIds = new Set<string>();
  const seenNumbers = new Set<number>();

  return rows.map((raw: unknown, index: number): ImportRowInput => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Row ${index + 1}: invalid transaction`);
    }
    const r = raw as Partial<ImportRowInput>;
    const rowNumber = r.rowNumber === undefined ? index + 1 : r.rowNumber;
    if (
      typeof rowNumber !== "number" ||
      !Number.isSafeInteger(rowNumber) ||
      rowNumber < 1 ||
      seenNumbers.has(rowNumber)
    ) {
      throw new Error(`Row ${index + 1}: invalid or duplicate row number`);
    }
    seenNumbers.add(rowNumber);

    if (
      typeof r.txnDate !== "string" ||
      !ISO_DATE.test(r.txnDate) ||
      parseDateValue(r.txnDate, "YYYY-MM-DD") !== r.txnDate
    ) {
      throw new Error(`Row ${rowNumber}: invalid calendar date`);
    }
    if (
      typeof r.amountMinor !== "number" ||
      !Number.isSafeInteger(r.amountMinor) ||
      r.amountMinor === 0
    ) {
      throw new Error(`Row ${rowNumber}: invalid or unsafe amount`);
    }
    const description = typeof r.description === "string" ? r.description.trim() : "";
    if (!description) throw new Error(`Row ${rowNumber}: description is required`);

    const externalId = typeof r.externalId === "string" ? r.externalId.trim() : "";
    if (!externalId || externalId.length > 200 || seenIds.has(externalId)) {
      throw new Error(`Row ${rowNumber}: missing, duplicate or oversized transaction ID`);
    }
    seenIds.add(externalId);

    if (r.force !== undefined && typeof r.force !== "boolean") {
      throw new Error(`Row ${rowNumber}: invalid duplicate override`);
    }
    return {
      rowNumber,
      txnDate: r.txnDate,
      amountMinor: r.amountMinor,
      description: description.slice(0, 500),
      reference: optionalText(r.reference, 120, "reference", rowNumber),
      payee: optionalText(r.payee, 200, "payee", rowNumber),
      externalId,
      force: r.force === true,
    };
  });
}
