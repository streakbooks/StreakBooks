export type UnitImportRow = {
  unitCode: string;
  kind: string;
  saleableArea: number;
  listPriceMinor: number;
  carpetArea: number;
  builtUpArea: number;
  landArea: number;
  status: "planned" | "available" | "under_development";
};

function importStatus(value: string, lineNo: number): UnitImportRow["status"] {
  if (value === "planned" || value === "available" || value === "under_development") return value;
  throw new Error(`Row ${lineNo + 2} has a status that cannot be imported.`);
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

/** CSV import for inventory. Excel workbooks need to be saved as CSV first. */
export function parseUnitCsv(text: string): UnitImportRow[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < 2) throw new Error("The CSV needs a header and at least one property.");
  const header = splitCsvLine(lines[0] ?? "").map((cell) => cell.toLowerCase());
  const index = (name: string) => header.indexOf(name);
  if (index("unit_code") < 0 || index("kind") < 0 || index("list_price_minor") < 0) {
    throw new Error("CSV headers must include unit_code, kind and list_price_minor.");
  }
  const rows = lines.slice(1).map((line, lineNo) => {
    const cells = splitCsvLine(line);
    const read = (name: string) => cells[index(name)] ?? "";
    const price = Number(read("list_price_minor"));
    if (!Number.isSafeInteger(price) || price < 0) {
      throw new Error(`Row ${lineNo + 2} has an invalid list_price_minor.`);
    }
    const area = (name: string) => {
      const raw = read(name);
      if (!raw) return 0;
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 0)
        throw new Error(`Row ${lineNo + 2} has an invalid ${name}.`);
      return value;
    };
    const status = importStatus(read("status") || "available", lineNo);
    const unitCode = read("unit_code");
    if (!unitCode) throw new Error(`Row ${lineNo + 2} is missing unit_code.`);
    return {
      unitCode,
      kind: read("kind") || "apartment",
      saleableArea: area("saleable_area"),
      listPriceMinor: price,
      carpetArea: area("carpet_area"),
      builtUpArea: area("built_up_area"),
      landArea: area("land_area"),
      status,
    };
  });
  if (rows.length > 200) throw new Error("Import at most 200 properties at a time.");
  return rows;
}
