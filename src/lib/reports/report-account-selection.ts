/** Validate account-scoped report requests before reading ledger data.
 * Never treat a malformed or oversized selection as "All accounts".
 * An omitted selection intentionally means all accounts for the tenant.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseReportAccountIds(raw: string | undefined): string[] {
  if (raw === undefined || raw === "") return [];
  if (raw.length > 3700) throw new Error("Account selection is too long; choose fewer accounts");
  const parts = raw.split(",").map((id) => id.trim());
  if (parts.some((id) => !UUID.test(id))) throw new Error("Invalid report account selection");
  const ids = [...new Set(parts)];
  if (ids.length > 100) throw new Error("Choose up to 100 report accounts");
  return ids;
}
