/** Safe YYYY-MM-DD validation shared across payroll settings and employee entry.
 * JavaScript dates silently roll over invalid days, whereas PostgreSQL DATE does not.
 */
export function isValidPayrollDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
