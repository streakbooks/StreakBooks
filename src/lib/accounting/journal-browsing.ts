import { JOURNAL_SOURCE_LABELS } from "./journal-display";
import { isReportDate } from "@/lib/reports/date-validation";

/** All browse-only fields; document authorisation remains server-side. */
export type JournalBrowseSearch = {
  journalQ?: string | undefined;
  journalSource?: string | undefined;
  journalFrom?: string | undefined;
  journalTo?: string | undefined;
  journalPageSize?: 50 | 100 | 200 | undefined;
  journalPage?: number | undefined;
  journalSort?: "number" | "date" | "source" | "amount" | undefined;
  journalDir?: "asc" | "desc" | undefined;
};

export const JOURNAL_BROWSE_KEYS = [
  "journalQ",
  "journalSource",
  "journalFrom",
  "journalTo",
  "journalPageSize",
  "journalPage",
  "journalSort",
  "journalDir",
] as const;

const SORTS = new Set(["number", "date", "source", "amount"]);
const PAGE_SIZES = new Set([50, 100, 200]);

export function parseJournalBrowseSearch(raw: Record<string, unknown>): JournalBrowseSearch {
  const result: JournalBrowseSearch = {};
  const q = raw["journalQ"];
  // Ignore blank-only URL searches; normalize surrounding whitespace for stable deep links.
  if (typeof q === "string" && !/[\p{Cc}\u061c\u200e-\u200f\u2028-\u202e\u2066-\u2069]/u.test(q)) {
    const normalized = q.trim();
    // Apply the limit to the effective search, not harmless URL padding.
    if (normalized && normalized.length <= 120) result.journalQ = normalized;
  }
  const source = raw["journalSource"];
  if (
    typeof source === "string" &&
    Object.prototype.hasOwnProperty.call(JOURNAL_SOURCE_LABELS, source)
  )
    result.journalSource = source;
  if (isReportDate(raw["journalFrom"])) result.journalFrom = raw["journalFrom"];
  if (isReportDate(raw["journalTo"])) result.journalTo = raw["journalTo"];

  // Keep a valid start date, but never restore an inverted date window.
  if (result.journalFrom && result.journalTo && result.journalFrom > result.journalTo) {
    delete result.journalTo;
  }

  const pageSize = raw["journalPageSize"];
  if (
    (typeof pageSize === "number" || typeof pageSize === "string") &&
    ((typeof pageSize === "number" && Number.isInteger(pageSize)) ||
      (typeof pageSize === "string" && /^(50|100|200)$/.test(pageSize))) &&
    PAGE_SIZES.has(Number(pageSize))
  ) {
    result.journalPageSize = Number(pageSize) as NonNullable<
      JournalBrowseSearch["journalPageSize"]
    >;
  }

  const page = raw["journalPage"];
  if (
    (typeof page === "number" && Number.isSafeInteger(page) && page >= 0) ||
    (typeof page === "string" && /^(0|[1-9]\d{0,6})$/.test(page))
  ) {
    result.journalPage = Math.min(Number(page), 1_000_000);
  }

  const sort = raw["journalSort"];
  if (typeof sort === "string" && SORTS.has(sort)) {
    result.journalSort = sort as NonNullable<JournalBrowseSearch["journalSort"]>;
    result.journalDir = raw["journalDir"] === "desc" ? "desc" : "asc";
  }
  return result;
}

export function pickJournalBrowseSearch(raw: JournalBrowseSearch): JournalBrowseSearch {
  const next: Record<string, unknown> = {};
  for (const key of JOURNAL_BROWSE_KEYS) {
    const value = raw[key];
    if (value !== undefined) next[key] = value;
  }
  return parseJournalBrowseSearch(next);
}
