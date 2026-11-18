import { isAttachmentEntityType, type AttachmentEntityType } from "./attachments";

/** Authorised Files data access is always enforced server-side; URL state is display-only. */
export type FilesListSearch = {
  folder?: string;
  file?: string;
  q?: string;
  type?: "all" | AttachmentEntityType;
  sort?: "newest" | "oldest" | "name" | "largest";
  view?: "all" | "to-file" | "review";
  page?: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SORT = new Set(["newest", "oldest", "name", "largest"]);
const VIEWS = new Set(["all", "to-file", "review"]);

/** Bound and allowlist all URL fields. Never interpret any field as a redirect. */
export function parseFilesListSearch(raw: Record<string, unknown>): FilesListSearch {
  const result: FilesListSearch = {};
  // Route search may originate from malformed runtime input, not only typed router state.
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return result;
  // URL state must contain only explicit query entries, never prototype-inherited fields.
  const own = (key: string): unknown => Object.prototype.hasOwnProperty.call(raw, key) ? raw[key] : undefined;
  for (const key of ["folder", "file"] as const) {
    const id = own(key);
    if (typeof id === "string" && UUID.test(id)) result[key] = id;
  }
  const q = own("q");
  // Normalize bookmarked searches, but reject invisible controls that can spoof file names.
  if (typeof q === "string") {
    const normalized = q.trim();
    if (normalized.length > 0 && normalized.length <= 120 &&
      !/[\u0000-\u001f\u007f-\u009f\u061c\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/u.test(normalized))
      result.q = normalized;
  }

  const type = own("type");
  if (type === "all" || isAttachmentEntityType(type)) result.type = type;

  const sort = own("sort");
  if (typeof sort === "string" && SORT.has(sort))
    result.sort = sort as FilesListSearch["sort"];

  const view = own("view");
  if (typeof view === "string" && VIEWS.has(view))
    result.view = view as FilesListSearch["view"];

  const page = own("page");
  if (
    (typeof page === "number" && Number.isSafeInteger(page) && page >= 0) ||
    (typeof page === "string" && /^(0|[1-9]\d{0,6})$/.test(page))
  ) result.page = Math.min(Number(page), 1_000_000);

  return result;
}
