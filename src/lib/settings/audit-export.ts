/** Audit export uses only the rows already returned for the authorised company. */
export type SettingsAuditExportRow = {
  created_at: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  actor_user_id: string | null;
};

export const AUDIT_PAGE_SIZE = 50;

function auditCsvCell(value: string | null): string {
  const normalized = (value ?? "").replace(/[\r\n]+/g, " ");
  // Prevent user-controlled audit labels becoming spreadsheet formulas.
  const safe = /^[\s]*[=+@-]/.test(normalized) ? "'" + normalized : normalized;
  return '"' + safe.replaceAll('"', '""') + '"';
}

export function buildSettingsAuditCsv(rows: readonly SettingsAuditExportRow[]): string {
  const header = ["When", "Action", "Entity type", "Entity ID", "Actor ID"];
  const lines = [
    header.map((value) => auditCsvCell(value)).join(","),
    ...rows.map((row) =>
      [row.created_at, row.action, row.entity_type, row.entity_id, row.actor_user_id]
        .map((value) => auditCsvCell(value))
        .join(","),
    ),
  ];
  return lines.join("\r\n") + "\r\n";
}

/** Request one extra row to distinguish an exact final page from a next page. */
export function hasNextSettingsAuditPage(recordCount: number): boolean {
  return recordCount > AUDIT_PAGE_SIZE;
}

export function formatSettingsAuditPageLabel(offset: number, count: number): string {
  if (count === 0) return "No matching events";
  return `Showing ${offset + 1}–${offset + count} matching events (page size ${AUDIT_PAGE_SIZE}).`;
}
