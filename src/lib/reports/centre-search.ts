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
} {
  const result: { tab?: ReportingTab; from?: string; to?: string } = {
    tab: REPORTING_TABS.includes(raw["tab"] as ReportingTab)
      ? (raw["tab"] as ReportingTab)
      : "home",
  };
  for (const key of ["from", "to"] as const) {
    const value = raw[key];
    if (typeof value === "string" && isReportDate(value)) result[key] = value;
  }
  return result;
}
