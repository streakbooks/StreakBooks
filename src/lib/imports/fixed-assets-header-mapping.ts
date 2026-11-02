import { toCsv } from "@/lib/sales/csv";
import { getImportDefinition } from "./import-definitions";
import { parseImportCsv } from "./import-preflight";

export type FixedAssetColumnMapping = Record<string, string>;

const definition = getImportDefinition("fixed_assets", "Asset register");

/** The only place the fixed asset import wizard interprets arbitrary source headings. */
export function fixedAssetSourceHeaders(text: string): string[] {
  if (text.length > 5 * 1024 * 1024) throw new Error("CSV exceeds 5 MB");
  const rows = parseImportCsv(text);
  if (!rows.length) throw new Error("File is empty");
  const headers = rows[0]!.map((value) => value.trim());
  const normalized = headers.map((h) => h.toLocaleLowerCase("en-US"));
  if (headers.some((h) => !h)) throw new Error("Blank source column heading");
  if (new Set(normalized).size !== normalized.length)
    throw new Error("Duplicate source column headings");
  return headers;
}

/**
 * Normalize legacy CSV columns to the published LinkBooks template before server submission.
 * This is convenience only: the server independently validates financial data and permissions.
 * Unknown source columns are not imported. No values or monetary amounts are transformed.
 */
export function mapFixedAssetCsv(text: string, mapping: FixedAssetColumnMapping): string {
  const headers = fixedAssetSourceHeaders(text);
  const source = parseImportCsv(text);
  if (source.length - 1 > 100) throw new Error("File exceeds maximum 100 fixed asset records");
  const sourceByName = new Map(headers.map((name, i) => [name.toLocaleLowerCase("en-US"), i]));
  const used = new Set<number>();
  const positions = definition.fields.map((field) => {
    const selected = Object.prototype.hasOwnProperty.call(mapping, field.key)
      ? mapping[field.key]
      : field.label;
    if (!selected) {
      if (field.required) throw new Error("Map required field: " + field.label);
      return -1;
    }
    const index = sourceByName.get(selected.trim().toLocaleLowerCase("en-US"));
    if (index === undefined) {
      if (field.required) throw new Error("Map required field: " + field.label);
      return -1;
    }
    if (used.has(index))
      throw new Error("A source column cannot map to multiple asset fields: " + selected);
    used.add(index);
    return index;
  });
  const records = source.slice(1).map((cells, rowIndex) => {
    if (cells.length !== headers.length)
      throw new Error("Row " + (rowIndex + 2) + ": column count differs from heading");
    return positions.map((position) => (position < 0 ? "" : (cells[position] ?? "").trim()));
  });
  return toCsv(
    definition.fields.map((field) => field.label),
    records,
  );
}
