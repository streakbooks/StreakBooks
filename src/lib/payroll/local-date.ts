/** Default date for a browser-entered payroll payment or reversal.
 * Use the user's local calendar day, not the UTC day in toISOString().
 */
export function todayLocalDateOnly(date: Date = new Date()): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
