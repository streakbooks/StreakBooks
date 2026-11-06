/** Preserve unsaved reconciliation review edits when refreshed server state advances. */
export function hasConcurrentTaxReviewChange(
  isEditing: boolean,
  editingVersion: number | null,
  latestVersion: number | null,
): boolean {
  return isEditing && editingVersion !== latestVersion;
}
