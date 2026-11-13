import { parseReportingCentreSearch } from "./centre-search";

export type ReportingCentreContext = ReturnType<typeof parseReportingCentreSearch>;

const CENTRE_KEYS: ReadonlyArray<keyof ReportingCentreContext> = [
  "tab",
  "from",
  "to",
  "pack",
  "query",
  "category",
];
const MAX_CONTEXT_LENGTH = 2048;

/**
 * Only validated, bounded report-centre query fields may be used as an origin.
 * This token never represents a destination URL or bypasses report permissions.
 */
export function encodeReportingCentreContext(
  search: Record<string, unknown>,
): string {
  const safe = parseReportingCentreSearch(search);
  const params = new URLSearchParams();
  for (const key of CENTRE_KEYS) {
    const value = safe[key];
    if (value !== undefined && value !== "") params.set(key, value);
  }
  const encoded = params.toString();
  return encoded.length <= MAX_CONTEXT_LENGTH ? encoded : "";
}

export function decodeReportingCentreContext(raw: unknown): ReportingCentreContext | null {
  if (typeof raw !== "string" || !raw || raw.length > MAX_CONTEXT_LENGTH) return null;
  const params = new URLSearchParams(raw);
  // A return context must originate from a reports workspace, not arbitrary URL data.
  if (!params.has("tab") || params.get("tab") === "") return null;
  return parseReportingCentreSearch(Object.fromEntries(params));
}

export function normalizeReportingCentreContext(raw: unknown): string | undefined {
  const decoded = decodeReportingCentreContext(raw);
  return decoded ? encodeReportingCentreContext(decoded) || undefined : undefined;
}

/** Fallback for a report opened directly, without a Reports Centre origin. */
export function reportingCentreBackSearch(
  token: unknown,
  defaultFrom: string,
  defaultTo: string,
): ReportingCentreContext {
  return (
    decodeReportingCentreContext(token) ?? {
      tab: "standard",
      from: defaultFrom,
      to: defaultTo,
    }
  );
}
