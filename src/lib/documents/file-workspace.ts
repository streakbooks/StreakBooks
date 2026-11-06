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


/** Fixed, non-user-defined MIME groups; never build a database filter from arbitrary text. */
export const FILE_FORMATS = ["all", "pdf", "images", "spreadsheets", "word", "text"] as const;
export type FileFormat = (typeof FILE_FORMATS)[number];

export function parseFileFormat(value: unknown): FileFormat {
  return FILE_FORMATS.find((format) => format === value) ?? "all";
}

export function fileFormatMimeTypes(format: FileFormat): readonly string[] {
  switch (format) {
    case "pdf":
      return ["application/pdf"];
    case "images":
      return ["image/png", "image/jpeg", "image/gif", "image/webp", "image/heic", "image/heif"];
    case "spreadsheets":
      return [
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "text/csv",
      ];
    case "word":
      return [
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ];
    case "text":
      return ["text/plain"];
    default:
      return [];
  }
}


/**
 * An internal deep link, never a signed Storage URL or a public share token.
 * The server still checks the recipient's membership and record permissions.
 */
export function internalFileUrl(origin: string, attachmentId: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(attachmentId))
    throw new Error("Invalid file identifier.");
  const url = new URL("/files", origin);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Invalid application origin.");
  url.searchParams.set("file", attachmentId);
  return url.toString();
}
