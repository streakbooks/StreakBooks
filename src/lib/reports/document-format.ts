import type { DocumentRow } from "./report-document";
export function displayDocumentValue(
  value: string,
  row: Pick<DocumentRow, "negative" | "format">,
): string {
  if (value === "") return "";
  const negative = value.startsWith("-");
  const abs = negative ? value.slice(1) : value;
  const [whole, decimals] = abs.split(".");
  const grouped =
    whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (decimals !== undefined ? `.${decimals}` : "");
  const withUnit = grouped + (row.format === "percent" ? "%" : "");
  const formatted = negative
    ? row.negative === "minus"
      ? `-${withUnit}`
      : `(${withUnit})`
    : withUnit;
  return formatted;
}
