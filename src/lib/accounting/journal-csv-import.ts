import { decimalPlacesFor, toMinorUnits, toSafeMinorNumber } from "@/lib/accounting/money";

export const JOURNAL_CSV_HEADERS = ["account_code", "description", "debit", "credit"] as const;

export type JournalImportAccount = {
  id: string;
  code: string;
  is_active: boolean;
  is_postable: boolean;
  is_control?: boolean;
};
export type ImportedJournalLine = {
  accountId: string;
  description: string;
  debit: string;
  credit: string;
};

const MAX_CSV_CHARS = 256000;
const MAX_IMPORT_LINES = 200;

/** Minimal RFC 4180 parser. Quoted line breaks and escaped quotes are supported. */
export function parseCsvCells(text: string): string[][] {
  if (text.length > MAX_CSV_CHARS) throw new Error("CSV exceeds the 256 KB import limit.");
  const input = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let quoteClosed = false;
  const pushCell = () => {
    row.push(cell);
    cell = "";
    quoteClosed = false;
  };
  const pushRow = () => {
    pushCell();
    if (row.some((value) => value.trim() !== "")) rows.push(row);
    row = [];
    if (rows.length > MAX_IMPORT_LINES + 1) {
      throw new Error("Import one journal with at most 200 lines at a time.");
    }
  };
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]!;
    if (quoted) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
          quoteClosed = true;
        }
      } else {
        cell += char;
      }
      continue;
    }
    if (char === ",") {
      pushCell();
      continue;
    }
    if (char === "\r" || char === "\n") {
      pushRow();
      if (char === "\r" && input[index + 1] === "\n") index += 1;
      continue;
    }
    if (char === '"' && cell === "" && !quoteClosed) {
      quoted = true;
      continue;
    }
    if (char === '"' || quoteClosed) throw new Error("Malformed CSV quotation.");
    cell += char;
  }
  if (quoted) throw new Error("Unclosed quoted CSV field.");
  if (row.length || cell.length || quoteClosed) pushRow();
  return rows;
}

/**
 * Imports one journal into the existing **unposted** form. It never writes to
 * the ledger. The form still uses the authoritative manual-journal posting API.
 */
export function importJournalLinesCsv(
  text: string,
  accounts: JournalImportAccount[],
  currencyCode: string,
): ImportedJournalLine[] {
  const rows = parseCsvCells(text);
  if (!rows.length) throw new Error("The CSV is empty.");
  const headers = rows[0]!.map((value) => value.trim().toLowerCase().replace(/\s+/g, "_"));
  if (
    headers.length !== JOURNAL_CSV_HEADERS.length ||
    !JOURNAL_CSV_HEADERS.every((value, index) => headers[index] === value)
  ) {
    throw new Error("Expected CSV columns: account_code, description, debit, credit.");
  }
  const dataRows = rows.slice(1);
  if (dataRows.length < 2 || dataRows.length > MAX_IMPORT_LINES) {
    throw new Error("A manual journal CSV requires 2 to 200 lines.");
  }
  const byCode = new Map<string, JournalImportAccount>();
  const duplicates = new Set<string>();
  for (const account of accounts) {
    const key = account.code.trim().toUpperCase();
    if (byCode.has(key)) duplicates.add(key);
    byCode.set(key, account);
  }
  const decimalPlaces = decimalPlacesFor(currencyCode);
  const money = (value: string, rowNumber: number, label: string) => {
    const source = value.trim() || "0";
    if (!/^\d+(\.\d+)?$/.test(source))
      throw new Error("Row " + rowNumber + ": " + label + " must be a non-negative decimal.");
    const decimal = source.split(".")[1] ?? "";
    if (decimal.length > decimalPlaces) {
      throw new Error("Row " + rowNumber + ": " + label + " exceeds currency decimal precision.");
    }
    const minor = toMinorUnits(source, currencyCode);
    toSafeMinorNumber(minor, "Row " + rowNumber + " " + label);
    return minor;
  };

  let totalDebit = 0n;
  let totalCredit = 0n;
  const lines: ImportedJournalLine[] = dataRows.map((row, index) => {
    const rowNumber = index + 2;
    if (row.length !== 4) throw new Error("Row " + rowNumber + ": expected exactly four columns.");
    const code = row[0]!.trim().toUpperCase();
    const account = byCode.get(code);
    if (
      !account ||
      duplicates.has(code) ||
      !account.is_active ||
      !account.is_postable ||
      account.is_control
    ) {
      throw new Error(
        "Row " +
          rowNumber +
          ": account code is unknown, ambiguous or not allowed for manual posting.",
      );
    }
    const description = row[1]!.trim();
    if (description.length > 300) {
      throw new Error("Row " + rowNumber + ": description exceeds 300 characters.");
    }
    const debit = money(row[2]!, rowNumber, "debit");
    const credit = money(row[3]!, rowNumber, "credit");
    if ((debit === 0n && credit === 0n) || (debit > 0n && credit > 0n)) {
      throw new Error("Row " + rowNumber + ": choose exactly one non-zero debit or credit.");
    }
    totalDebit += debit;
    totalCredit += credit;
    return {
      accountId: account.id,
      description,
      debit: row[2]!.trim() || "0",
      credit: row[3]!.trim() || "0",
    };
  });

  if (totalDebit <= 0n || totalDebit !== totalCredit) {
    throw new Error("Imported journal debits and credits must balance before review.");
  }
  toSafeMinorNumber(totalDebit, "Journal total");
  return lines;
}
