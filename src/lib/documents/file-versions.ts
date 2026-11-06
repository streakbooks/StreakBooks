import {
  MAX_FILE_BYTES,
  validateUpload,
} from "@/lib/documents/attachments";
import { validateFileRename } from "@/lib/documents/file-workspace";

export const MAX_FILE_VERSIONS = 50;

export type FileVersionItem = {
  version: number;
  isCurrent: boolean;
  fileName: string;
  contentType: string | null;
  sizeBytes: number | null;
  uploadedBy: string | null;
  createdAt: string;
};

/** Preserve the logical file's name and extension across immutable replacements. */
export function validateVersionReplacement(
  originalName: string,
  replacement: { name: string; size: number; type: string },
  currentVersion: number,
): { fileName: string; contentType: string; sizeBytes: number } {
  if (!Number.isSafeInteger(currentVersion) || currentVersion < 1)
    throw new Error("Invalid document version. Refresh and retry.");
  if (currentVersion >= MAX_FILE_VERSIONS)
    throw new Error("This file has reached the 50-version limit.");
  if (
    replacement.size <= 0 ||
    replacement.size > MAX_FILE_BYTES ||
    !Number.isSafeInteger(replacement.size)
  ) throw new Error("Replacement must be between 1 byte and 20 MB.");
  // File extension changes would break existing previews and signed download names.
  validateFileRename(originalName, replacement.name);
  const contentType = replacement.type.split(";")[0]!.trim().toLowerCase();
  if (!contentType) throw new Error("Replacement file must have a recognized content type.");
  const check = validateUpload({
    fileName: replacement.name,
    sizeBytes: replacement.size,
    contentType,
  });
  if (!check.ok) throw new Error(check.error);
  return { fileName: replacement.name, contentType, sizeBytes: replacement.size };
}

/** Ensure the row snapshot and version number form a contiguous, reliable history. */
export function assertVersionHistory(
  versions: readonly Pick<FileVersionItem, "version">[],
  expectedCurrent: number,
): void {
  if (!Number.isSafeInteger(expectedCurrent) || expectedCurrent < 1 ||
      expectedCurrent > MAX_FILE_VERSIONS) throw new Error("Invalid current file version.");
  if (versions.length !== expectedCurrent)
    throw new Error("Document version history is incomplete.");
  const actual = new Set(versions.map((item) => item.version));
  if (actual.size !== expectedCurrent ||
      !Array.from({ length: expectedCurrent }, (_, index) => index + 1)
        .every((version) => actual.has(version)))
    throw new Error("Document version history has missing or duplicate revisions.");
}
