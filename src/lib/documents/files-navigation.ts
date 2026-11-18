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
  for (const key of ["folder", "file"] as const) {
    const id = raw[key];
    if (typeof id === "string" && UUID.test(id)) result[key] = id;
  }
  const q = raw["q"];
  if (typeof q === "string" && q.length > 0 && q.length <= 120) result.q = q;

  const type = raw["type"];
  if (type === "all" || isAttachmentEntityType(type)) result.type = type;

  const sort = raw["sort"];
  if (typeof sort === "string" && SORT.has(sort))
    result.sort = sort as FilesListSearch["sort"];

  const view = raw["view"];
  if (typeof view === "string" && VIEWS.has(view))
    result.view = view as FilesListSearch["view"];

  const page = raw["page"];
  if (
    (typeof page === "number" && Number.isSafeInteger(page) && page >= 0) ||
    (typeof page === "string" && /^\d{1,7}$/.test(page))
  ) result.page = Math.min(Number(page), 1_000_000);

  return result;
}
