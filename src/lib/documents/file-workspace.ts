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
