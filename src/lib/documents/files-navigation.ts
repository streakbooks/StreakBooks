import { isAttachmentEntityType, type AttachmentEntityType } from "./attachments";

/** Authorised Files data access is always enforced server-side; URL state is display-only. */
export type FilesListSearch = {
  folder?: string | undefined;
  file?: string | undefined;
  q?: string | undefined;
  type?: "all" | AttachmentEntityType | undefined;
  sort?: "newest" | "oldest" | "name" | "largest" | undefined;
  view?: "all" | "to-file" | "review" | "inbox" | "trash" | undefined;
  page?: number | undefined;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SORT = new Set(["newest", "oldest", "name", "largest"]);
const VIEWS = new Set(["all", "to-file", "review", "inbox", "trash"]);

/** Bound and allowlist all URL fields. Never interpret any field as a redirect. */
export function parseFilesListSearch(raw: Record<string, unknown>): FilesListSearch {
  const result: FilesListSearch = {};
  // Route search may originate from malformed runtime input, not only typed router state.
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return result;
  // URL state must contain only explicit query entries, never prototype-inherited fields.
  const own = (key: string): unknown => {
    // Never execute user-defined accessors while decoding an untrusted route search.
    // TanStack search state and URLSearchParams-derived objects use data properties.
    try {
      const descriptor = Object.getOwnPropertyDescriptor(raw, key);
      return descriptor && "value" in descriptor ? descriptor.value : undefined;
    } catch {
      // A Proxy may throw from getOwnPropertyDescriptor; ignore only that field.
      return undefined;
    }
  };
  for (const key of ["folder", "file"] as const) {
    const id = own(key);
    if (typeof id === "string" && UUID.test(id)) result[key] = id;
  }
  const q = own("q");
  // Normalize bookmarked searches, but reject invisible controls that can spoof file names.
  if (typeof q === "string") {
    const normalized = q.trim();
    if (
      normalized.length > 0 &&
      normalized.length <= 120 &&
      !/[\p{Cc}\u061c\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/u.test(normalized)
    )
      result.q = normalized;
  }

  const type = own("type");
  if (type === "all" || isAttachmentEntityType(type)) result.type = type;

  const sort = own("sort");
  if (typeof sort === "string" && SORT.has(sort))
    result.sort = sort as NonNullable<FilesListSearch["sort"]>;

  const view = own("view");
  if (typeof view === "string" && VIEWS.has(view))
    result.view = view as NonNullable<FilesListSearch["view"]>;

  const page = own("page");
  if (
    (typeof page === "number" && Number.isSafeInteger(page) && page >= 0) ||
    (typeof page === "string" && /^(0|[1-9]\d{0,6})$/.test(page))
  )
    result.page = Math.min(Number(page), 1_000_000);

  return result;
}
