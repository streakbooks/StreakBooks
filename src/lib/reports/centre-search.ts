import { isReportDate } from "./date-validation";
export const REPORTING_TABS = [
  "home",
  "standard",
  "custom",
  "management",
  "packs",
  "adviser",
  "drafts",
  "published",
  "archived",
  "schedules",
  "templates",
] as const;
export type ReportingTab = (typeof REPORTING_TABS)[number];
export function parseReportingCentreSearch(raw: Record<string, unknown>): {
  tab?: ReportingTab;
  from?: string;
  to?: string;
  pack?: string | undefined;
} {
  const result: { tab?: ReportingTab; from?: string; to?: string; pack?: string } = {
    tab: REPORTING_TABS.includes(raw["tab"] as ReportingTab)
      ? (raw["tab"] as ReportingTab)
      : "standard",
  };
  const pack = raw["pack"];
  if (typeof pack === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(pack)) {
    result.pack = pack;
  }
  for (const key of ["from", "to"] as const) {
    const value = raw[key];
    if (typeof value === "string" && isReportDate(value)) result[key] = value;
  }
  return result;
}
