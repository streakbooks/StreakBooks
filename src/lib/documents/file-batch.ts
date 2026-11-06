/**
 * Bounded sequential file operations. Every item is attempted exactly once.
 * The caller remains responsible for enforcing permissions on each server request.
 */
export const MAX_FILES_PER_BATCH = 25;

export type FileBatchOutcome = {
  completedIds: string[];
  failedIds: string[];
  warningIds: string[];
  firstError: unknown;
};

export async function runFileBatch<T>(
  ids: readonly string[],
  operation: (attachmentId: string) => Promise<T>,
  needsFollowUp: (value: T) => boolean = () => false,
): Promise<FileBatchOutcome> {
  if (ids.length < 1 || ids.length > MAX_FILES_PER_BATCH || new Set(ids).size !== ids.length)
    throw new Error("Select 1–25 distinct files on the current page.");

  const completedIds: string[] = [];
  const failedIds: string[] = [];
  const warningIds: string[] = [];
  let firstError: unknown = null;

  for (const attachmentId of ids) {
    try {
      const result = await operation(attachmentId);
      completedIds.push(attachmentId);
      if (needsFollowUp(result)) warningIds.push(attachmentId);
    } catch (error) {
      failedIds.push(attachmentId);
      firstError ??= error;
    }
  }

  return { completedIds, failedIds, warningIds, firstError };
}
