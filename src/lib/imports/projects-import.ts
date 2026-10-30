import { getImportDefinition } from "./import-definitions";
import { previewImportCsv } from "./import-preflight";

export type ProjectImportRow = {
  sourceRow: number;
  code: string;
  name: string;
  customer: string | null;
  startDate: string | null;
};

const DEFINITION = getImportDefinition("projects", "Projects");
const CODE = /^[A-Za-z0-9][A-Za-z0-9-]{0,39}$/;

function validIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Non-posting projects: validates every row before any authenticated database write. */
export function prepareProjectsCsv(csvText: string): ProjectImportRow[] {
  if (csvText.length > 5 * 1024 * 1024) throw new Error("CSV exceeds 5 MB");
  const preview = previewImportCsv(csvText, DEFINITION, { maxRows: 250, uniqueBy: ["project_code"] });
  if (preview.issues.length) {
    const issue = preview.issues[0]!;
    throw new Error(`Row ${issue.row}: ${issue.message}`);
  }
  if (!preview.records.length) throw new Error("CSV has no project rows");
  const seen = new Set<string>();
  return preview.records.map(({ sourceRow, values }) => {
    const code = values["project_code"] ?? "";
    const name = values["name"] ?? "";
    const customer = values["customer"] || null;
    const startDate = values["start_date"] || null;
    if (!CODE.test(code)) throw new Error(`Row ${sourceRow}: Project code must contain 1–40 letters, digits or hyphens`);
    if (seen.has(code)) throw new Error(`Row ${sourceRow}: Duplicate project code ${code}`);
    seen.add(code);
    if (name.length > 160) throw new Error(`Row ${sourceRow}: Project name exceeds 160 characters`);
    if (customer && customer.length > 200) throw new Error(`Row ${sourceRow}: Customer name exceeds 200 characters`);
    if (startDate && !validIsoDate(startDate)) throw new Error(`Row ${sourceRow}: Invalid start date (YYYY-MM-DD)`);
    return { sourceRow, code, name, customer, startDate };
  });
}
