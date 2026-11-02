import { decimalValue } from "./custom-definition";
import type { DocumentRow, DocumentSection } from "./report-document";
export function displayDocumentValue(value: string, row: Partial<DocumentRow>): string {
  if (value === "") return "";
  value = documentNumericValue(value, row);
  if (documentZero(value) && (row.zero === "blank" || row.zero === "dash"))
    return row.zero === "blank" ? "" : "–";
  const negative = value.startsWith("-");
  const abs = negative ? value.slice(1) : value;
  const [whole, decimals] = abs.split(".");
  const grouped =
    (row.thousands === false ? whole! : whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",")) +
    (decimals !== undefined ? `.${decimals}` : "");
  const withUnit =
    (row.format === "money" ? (row.currencyPrefix ?? "") : "") +
    grouped +
    (row.format === "percent" ? "%" : "");
  const formatted = negative
    ? row.negative === "minus"
      ? `-${withUnit}`
      : `(${withUnit})`
    : withUnit;
  return formatted;
}

export function documentCellStyle(
  row: DocumentRow,
  section: DocumentSection,
  index: number,
): DocumentRow {
  const format = section.columnFormats?.[index];
  return format && format !== "inherit" ? { ...row, format } : row;
}

export function documentZero(value: string) {
  return /^-?0+(?:\.0+)?$/.test(value);
}
/** Display scaling leaves the immutable document/source values unchanged. */
export function documentNumericValue(value: string, row: Partial<DocumentRow>): string {
  if (!value || !row.scale || row.scale === "1" || row.format === "percent") return value;
  const decimals = value.split(".")[1]?.length ?? 0;
  return decimalValue(
    { n: value.replace(".", ""), d: (10n ** BigInt(decimals) * BigInt(row.scale)).toString() },
    decimals,
  );
}
export function documentCsvValue(value: string, row: DocumentRow): string {
  const scaled = documentNumericValue(value, row);
  if (documentZero(scaled) && (row.zero === "blank" || row.zero === "dash"))
    return row.zero === "blank" ? "" : "–";
  return scaled + (row.format === "percent" && scaled ? "%" : "");
}
