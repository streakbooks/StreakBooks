import { decimalPlacesFor } from "@/lib/accounting/money";
import { DEFAULT_MAPPING, isRealDate, type ImportMapping } from "./csv-mapping";
/** OFX 1.x SGML and OFX 2.x XML bank/credit-card statement intake; no XML/DTD execution. */
export const OFX_MAPPING: ImportMapping = {
  ...DEFAULT_MAPPING,
  delimiter: ",",
  hasHeader: true,
  dateFormat: "YYYY-MM-DD",
  dateColumn: 0,
  descriptionColumns: [1],
  amountColumn: 2,
  payeeColumn: 3,
  bankIdColumn: 4,
  referenceColumn: 5,
};
function decode(value: string): string {
  return value
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity: string) => {
      const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
      if (entity[0] !== "#") return named[entity.toLowerCase()] ?? "";
      const point =
        entity[1]?.toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      if (
        !Number.isInteger(point) ||
        point < 32 ||
        point > 0x10ffff ||
        (point >= 0xd800 && point <= 0xdfff)
      )
        throw new Error("Unsupported character in OFX statement");
      return String.fromCodePoint(point);
    })
    .trim();
}
const field = (block: string, name: string) =>
  decode(new RegExp(`<${name}\\s*>([^<]*)`, "i").exec(block)?.[1] ?? "");
const csv = (value: string) => '"' + value.replaceAll('"', '""') + '"';
export function parseOfxStatement(text: string): {
  csvText: string;
  currency: string;
  accountId: string;
  transactionCount: number;
} {
  if (text.length > 5 * 1024 * 1024) throw new Error("Statement exceeds the 5 MB limit");
  if (
    !/<OFX[\s>]/i.test(text) ||
    /<!DOCTYPE|<!ENTITY|<!\[CDATA\[|<INVTRANLIST|<CORRECTFITID|<CORRECTACTION/i.test(text)
  )
    throw new Error("Unsupported OFX statement type, correction or unsafe XML construct");
  const accounts = [...text.matchAll(/<(?:STMTRS|CCSTMTRS)\s*>/gi)];
  if (accounts.length !== 1) throw new Error("Import one bank or credit-card account at a time");
  if (
    [...text.matchAll(/<BANKTRANLIST\s*>/gi)].length !== 1 ||
    [...text.matchAll(/<\/BANKTRANLIST\s*>/gi)].length !== 1 ||
    !/<\/OFX\s*>/i.test(text)
  )
    throw new Error("Expected one bank transaction list");
  const currency = field(text, "CURDEF").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("OFX currency is missing or invalid");
  const accountId = field(text, "ACCTID");
  if (!accountId) throw new Error("OFX account identifier is missing");
  const rows: string[][] = [];
  const ids = new Set<string>();
  for (const match of text.matchAll(
    /<STMTTRN\s*>([\s\S]*?)(?:<\/STMTTRN\s*>|(?=<STMTTRN\s*>|<\/BANKTRANLIST\s*>))/gi,
  )) {
    const block = match[1]!;
    const rawDate = field(block, "DTPOSTED");
    const amount = field(block, "TRNAMT");
    const id = field(block, "FITID");
    if (!/^\d{8}(?:\d{6}(?:\.\d+)?(?:\[[^\]]+\])?)?$/.test(rawDate))
      throw new Error(`Invalid posted date in transaction ${rows.length + 1}`);
    const year = Number(rawDate.slice(0, 4)),
      month = Number(rawDate.slice(4, 6)),
      day = Number(rawDate.slice(6, 8));
    if (
      !isRealDate(year, month, day) ||
      !/^[-+]?\d+(?:\.\d+)?$/.test(amount) ||
      !id ||
      id.length > 120 ||
      /[1-9]/.test((amount.split(".")[1] ?? "").slice(decimalPlacesFor(currency))) ||
      ids.has(id)
    )
      throw new Error(
        `Invalid date, amount or duplicate/missing FITID in transaction ${rows.length + 1}`,
      );
    ids.add(id);
    const name = field(block, "NAME"),
      memo = field(block, "MEMO");
    rows.push([
      `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`,
      [name, memo].filter(Boolean).join(" — ") || field(block, "TRNTYPE") || "Bank transaction",
      amount.replace(/^\+/, ""),
      name,
      id,
      field(block, "CHECKNUM"),
    ]);
    if (rows.length > 10000)
      throw new Error("Statement exceeds 10,000 transactions; split it by date range");
  }
  const declared = [...text.matchAll(/<STMTTRN\s*>/gi)].length;
  if (!rows.length || rows.length !== declared)
    throw new Error("Statement is empty or contains incomplete transaction records");
  return {
    csvText: [
      ["Date", "Description", "Amount", "Payee", "Bank Transaction ID", "Reference"],
      ...rows,
    ]
      .map((row) => row.map(csv).join(","))
      .join("\r\n"),
    currency,
    accountId,
    transactionCount: rows.length,
  };
}
