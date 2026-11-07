/**
 * A contact detail can carry only the originating directory role/view.
 * Never accept a user-supplied path as a return destination.
 */
export const CONTACT_DIRECTORY_VIEWS = [
  "all",
  "customers",
  "suppliers",
  "both",
  "recent",
  "updated",
  "inactive",
  "archived",
] as const;

export type ContactDirectoryView = (typeof CONTACT_DIRECTORY_VIEWS)[number];

/** Invalid/untrusted query values intentionally return undefined. */
export function parseContactDirectoryView(value: unknown): ContactDirectoryView | undefined {
  return typeof value === "string" &&
    (CONTACT_DIRECTORY_VIEWS as readonly string[]).includes(value)
    ? (value as ContactDirectoryView)
    : undefined;
}

/** Allow only known safe filters in contact directory links and return context. */
export type ContactsDirectorySearch = {
  view?: string;
  q?: string;
  sort?: string;
  page?: number;
};

const SORT_FIELDS = [
  "name", "account", "roles", "email", "phone", "terms", "city", "state",
  "postal", "country", "legal", "tax", "currency", "credit", "status", "created", "modified",
];
const ALLOWED_SORTS = new Set([
  "default", "recent", "updated",
  ...SORT_FIELDS.flatMap((field) => [field + "_asc", field + "_desc"]),
]);
const MAX_RETURN_LENGTH = 2048;

export function parseContactsDirectorySearch(raw: Record<string, unknown>): ContactsDirectorySearch {
  const out: ContactsDirectorySearch = {};
  const view = parseContactDirectoryView(raw["view"]);
  if (view) out.view = view;
  const q = raw["q"];
  if (typeof q === "string" && q.length > 0 && q.length <= 100) out.q = q;
  const sort = raw["sort"];
  if (typeof sort === "string" && ALLOWED_SORTS.has(sort)) out.sort = sort;
  const page = raw["page"];
  if (typeof page === "number" && Number.isSafeInteger(page) && page >= 0)
    out.page = Math.min(page, 1_000_000);
  else if (typeof page === "string" && /^\d{1,7}$/.test(page))
    out.page = Math.min(Number(page), 1_000_000);
  return out;
}

export function encodeContactsReturnContext(raw: ContactsDirectorySearch): string {
  const validated = parseContactsDirectorySearch(raw);
  const params = new URLSearchParams();
  for (const key of ["view", "q", "sort", "page"] as const) {
    const value = validated[key];
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const token = params.toString();
  return token.length <= MAX_RETURN_LENGTH ? token : "";
}

/** No external URLs or unrecognized fields can become a return target. */
export function decodeContactsReturnContext(token: unknown): ContactsDirectorySearch {
  if (typeof token !== "string" || !token || token.length > MAX_RETURN_LENGTH) return {};
  return parseContactsDirectorySearch(Object.fromEntries(new URLSearchParams(token)));
}
