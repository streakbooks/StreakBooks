/** Pure orchestration of recipient-scoped notification RPCs. No accounting writes occur here. */
export type NotificationBulkResult = {
  attempted: number;
  updated: number;
  failedIds: string[];
  firstError: string | null;
  cancelled: boolean;
};

export async function runNotificationBulk(
  ids: readonly string[],
  update: (id: string) => Promise<void>,
  isCurrent: () => boolean,
  onProgress: (completed: number, total: number) => void,
): Promise<NotificationBulkResult> {
  const uniqueIds = [...new Set(ids)];
  let attempted = 0;
  let updated = 0;
  const failedIds: string[] = [];
  let firstError: string | null = null;
  const result = (cancelled: boolean): NotificationBulkResult => ({
    attempted,
    updated,
    failedIds,
    firstError,
    cancelled,
  });

  for (const id of uniqueIds) {
    if (!isCurrent()) return result(true);
    attempted++;
    try {
      await update(id);
      updated++;
    } catch (error) {
      failedIds.push(id);
      firstError ??= error instanceof Error ? error.message : "Update was rejected";
    }
    // Switching organisation, view or session invalidates this run even if the
    // in-flight RPC finished successfully. No subsequent request is sent.
    if (!isCurrent()) return result(true);
    onProgress(attempted, uniqueIds.length);
  }
  return result(false);
}
