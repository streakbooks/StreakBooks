/** Plan an employee CSV import against a fresh organisation-wide ID snapshot.
 * A blank ID intentionally remains a new record; existing IDs never overwrite.
 */
export function planPayrollEmployeeImport<T extends { employeeNumber: string }>(
  drafts: readonly T[],
  existingIds: ReadonlySet<string>,
): { toCreate: T[]; skipped: number } {
  const toCreate: T[] = [];
  let skipped = 0;
  const claimed = new Set(existingIds);
  for (const draft of drafts) {
    const number = draft.employeeNumber.trim();
    if (number && claimed.has(number)) {
      skipped += 1;
      continue;
    }
    toCreate.push(draft);
    if (number) claimed.add(number);
  }
  return { toCreate, skipped };
}
