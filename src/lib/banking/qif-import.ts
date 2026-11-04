import { DEFAULT_MAPPING, parseDateValue, type ImportMapping } from "./csv-mapping";

/**
 * QIF bank/credit-card statement adapter.
 *
 * QIF does not declare a date order, currency, bank transaction ID or account identity.
 * The importer must ask the user for the date order, use the selected bank account's
 * currency and retain the existing duplicate-review step.
 *
 * Unlike QIF software migrations, bank statement intake intentionally does not
 * post the exported categories or split allocations into the general ledger.
 */
export type QifDateOrder = "day-first" | "month-first";

export const QIF_MAPPING: ImportMapping = {
  ...DEFAULT_MAPPING,
  delimiter: ",",
  hasHeader: true,
  dateFormat: "YYYY-MM-DD",
  dateColumn: 0,
  descriptionColumns: [1],
  amountMode: "single",
  amountColumn: 2,
  payeeColumn: 3,
  referenceColumn: 4,
  bankIdColumn: null,
};

const csvCell = (value: string) => `"${value.replaceAll('"', '""')}"`;

function qifDate(value: string, order: QifDateOrder): string | null {
  const raw = value.trim().replaceAll("'", "/");
  if (/^\d{8}(?:\d{6})?$/.test(raw)) {
    const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    return parseDateValue(date, "YYYY-MM-DD");
  }
  if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(raw)) {
    return parseDateValue(raw, "YYYY-MM-DD");
  }
  if (/^\d{1,2}[\s/.-]+[A-Za-z]{3,}/.test(raw)) {
    return parseDateValue(raw, "DD-MMM-YYYY");
  }
  const numeric = /^\d{1,2}[\/.-]\d{1,2}[\/.-](\d{2}|\d{4})$/.exec(raw);
  if (!numeric) return null;
  const shortYear = numeric[1]!.length === 2;
  const format =
    order === "day-first"
      ? shortYear
        ? "DD/MM/YY"
        : "DD/MM/YYYY"
      : shortYear
        ? "MM/DD/YY"
        : "MM/DD/YYYY";
  return parseDateValue(raw, format);
}

type Tag = "D" | "T" | "U" | "P" | "M" | "N";
type Transaction = Partial<Record<Tag, string>>;

/** Convert only one single-account bank/credit-card QIF section to the normal preview CSV. */
export function parseQifStatement(
  input: string,
  dateOrder: QifDateOrder,
): { csvText: string; transactionCount: number } {
  if (input.length > 5 * 1024 * 1024) throw new Error("Statement exceeds the 5 MB limit");
  if (dateOrder !== "day-first" && dateOrder !== "month-first") {
    throw new Error("Choose whether QIF dates are day-first or month-first");
  }
  if (input.includes("\0")) throw new Error("QIF statement contains an invalid character");

  const lines = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  const rows: string[][] = [];
  let section: "Bank" | "CCard" | null = null;
  let transaction: Transaction = {};
  let started = false;

  for (const [index, original] of lines.entries()) {
    const line = original.trim();
    if (!line) continue;
    if (line.startsWith("!")) {
      if (section !== null || started) {
        throw new Error("Import one QIF bank or credit-card account at a time");
      }
      if (/^!Type:Bank$/i.test(line)) section = "Bank";
      else if (/^!Type:CCard$/i.test(line)) section = "CCard";
      else throw new Error("Unsupported QIF section. Only Bank and CCard are supported");
      continue;
    }
    if (section === null) throw new Error("QIF must begin with !Type:Bank or !Type:CCard");

    if (line === "^") {
      if (!started) throw new Error(`Empty QIF transaction at line ${index + 1}`);
      const date = transaction.D ? qifDate(transaction.D, dateOrder) : null;
      if (!date) throw new Error(`Invalid QIF date in transaction ${rows.length + 1}`);
      const amount = transaction.T?.trim();
      if (!amount) throw new Error(`Missing QIF amount in transaction ${rows.length + 1}`);
      if (
        transaction.U &&
        transaction.U.replaceAll(",", "").replace(/^\+/, "") !==
          amount.replaceAll(",", "").replace(/^\+/, "")
      ) {
        throw new Error(`Inconsistent QIF T/U amounts in transaction ${rows.length + 1}`);
      }
      const payee = transaction.P?.trim() ?? "";
      const memo = transaction.M?.trim() ?? "";
      const reference = transaction.N?.trim() ?? "";
      const description = [payee, memo].filter(Boolean).join(" — ") || reference || "Bank transaction";
      rows.push([date, description, amount, payee, reference]);
      if (rows.length > 10000) {
        throw new Error("Statement exceeds 10,000 transactions; split it by date range");
      }
      transaction = {};
      started = false;
      continue;
    }

    const tag = line[0]!;
    const value = line.slice(1);
    if (tag === "S" || tag === "E" || tag === "$") {
      throw new Error("Split QIF transactions are not supported; export a bank statement instead");
    }
    if (tag === "A" || tag === "C" || tag === "L") {
      started = true;
      continue;
    }
    if (!["D", "T", "U", "P", "M", "N"].includes(tag)) {
      throw new Error(`Unsupported QIF field at line ${index + 1}`);
    }
    const key = tag as Tag;
    if (transaction[key] !== undefined) {
      throw new Error(`Duplicate QIF field ${key} in transaction ${rows.length + 1}`);
    }
    transaction[key] = value;
    started = true;
  }
  if (!section || rows.length === 0) throw new Error("QIF statement contains no transactions");
  if (started) throw new Error("Incomplete QIF transaction: missing ^ terminator");

  return {
    csvText: [
      ["Date", "Description", "Amount", "Payee", "Reference"],
      ...rows,
    ]
      .map((cells) => cells.map(csvCell).join(","))
      .join("\r\n"),
    transactionCount: rows.length,
  };
}
