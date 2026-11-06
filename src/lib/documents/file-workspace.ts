/** Pure, shared rules for company Files. Never accept arbitrary client sort columns. */
export const FILE_SORTS = ["newest", "oldest", "name", "largest"] as const;
export type FileSort = (typeof FILE_SORTS)[number];

export function parseFileSort(value: unknown): FileSort {
  return FILE_SORTS.find((sort) => sort === value) ?? "newest";
}

export function fileSortOrder(sort: FileSort): { column: string; ascending: boolean } {
  switch (sort) {
    case "oldest":
      return { column: "created_at", ascending: true };
    case "name":
      return { column: "file_name", ascending: true };
    case "largest":
      return { column: "size_bytes", ascending: false };
    default:
      return { column: "created_at", ascending: false };
  }
}

export type FilePreviewKind = "image" | "pdf" | "text";

/** Content-type AND extension must agree. Never preview SVG, HTML or Office documents. */
export function filePreviewKind(
  contentType: string | null | undefined,
  fileName: string,
): FilePreviewKind | null {
  const mime = (contentType ?? "").split(";")[0]?.trim().toLowerCase();
  const extension = fileName.toLowerCase().split(".").pop();
  if (mime === "application/pdf" && extension === "pdf") return "pdf";
  if (
    (mime === "image/png" && extension === "png") ||
    (mime === "image/jpeg" && (extension === "jpg" || extension === "jpeg")) ||
    (mime === "image/gif" && extension === "gif") ||
    (mime === "image/webp" && extension === "webp")
  )
    return "image";
  if (
    (mime === "text/plain" && extension === "txt") ||
    (mime === "text/csv" && extension === "csv")
  )
    return "text";
  return null;
}


/**
 * Rename only the display/download filename, never the immutable Storage object key.
 * Keeping the extension avoids disguising an existing file as a different format.
 */
export function validateFileRename(currentName: string, requestedName: string): string {
  const name = requestedName.trim();
  if (
    !name ||
    name.length > 255 ||
    name === "." ||
    name === ".." ||
    /[\\/:*?"<>|\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(name) ||
    name.endsWith(".")
  )
    throw new Error("Use a valid file name (1–255 characters, without path or control characters).");

  const extension = (fileName: string) => {
    const dot = fileName.lastIndexOf(".");
    return dot > 0 ? fileName.slice(dot + 1).toLowerCase() : "";
  };
  if (extension(name) !== extension(currentName))
    throw new Error("Keep the original file extension when renaming.");
  return name;
}
