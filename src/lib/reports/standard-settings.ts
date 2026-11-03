import { z } from "zod";
import { isReportDate } from "./date-validation";
import { reportFiltersSchema } from "./report-filters";
export const standardSettingsSchema = z
  .object({
    basis: z.enum(["accrual", "cash"]).default("accrual"),
    group: z.enum(["total", "month", "quarter", "year"]).default("total"),
    compare: z
      .enum(["none", "prior_period", "prior_year", "ytd", "prior_ytd", "custom"])
      .default("none"),
    compareFrom: z.string().refine(isReportDate).optional(),
    compareTo: z.string().refine(isReportDate).optional(),
    changeAmount: z.boolean().default(false),
    changePercent: z.boolean().default(false),
    incomePercent: z.boolean().default(false),
    percentBasis: z.enum(["income", "expense", "row", "assets"]).default("income"),
    showTotal: z.boolean().default(true),
    includeZero: z.boolean().default(false),
    collapsedSections: z.array(z.string().max(100)).max(20).default([]),
    detail: z.enum(["accounts", "summary"]).default("accounts"),
    accountCodes: z.boolean().default(true),
    decimals: z.enum(["currency", "0", "2", "3"]).default("currency"),
    negative: z.enum(["minus", "parentheses"]).default("parentheses"),
    negativeRed: z.boolean().default(false),
    zero: z.enum(["zero", "dash", "blank"]).default("zero"),
    scale: z.enum(["1", "1000", "1000000"]).default("1"),
    currencySymbol: z.boolean().default(false),
    compact: z.boolean().default(false),
    showCompanyName: z.boolean().default(true),
    showReportTitle: z.boolean().default(true),
    showReportPeriod: z.boolean().default(true),
    showDatePrepared: z.boolean().default(false),
    showTimePrepared: z.boolean().default(false),
    headerOrder: z.enum(["company-first", "title-first"]).default("company-first"),
    headerAlignment: z.enum(["left", "center", "right"]).default("center"),
    footerAlignment: z.enum(["left", "center", "right"]).default("left"),
    bandedRows: z.boolean().default(false),
    reportBorders: z.enum(["default", "none", "all"]).default("default"),
    showBasis: z.boolean().default(true),
    showCurrencyNote: z.boolean().default(true),
    header: z.string().max(300).default(""),
    subtitle: z.string().max(300).default(""),
    footer: z.string().max(300).default(""),
    notes: z.string().max(4000).default(""),
    filters: reportFiltersSchema.default(() => reportFiltersSchema.parse({})),
  })
  .superRefine((s, ctx) => {
    if (s.compare === "custom" && (!s.compareFrom || !s.compareTo || s.compareFrom > s.compareTo))
      ctx.addIssue({ code: "custom", message: "Choose a valid custom comparison period" });
    if ((s.changeAmount || s.changePercent) && s.compare === "none")
      ctx.addIssue({ code: "custom", message: "Choose a comparison before adding changes" });
  });
export type StandardSettings = z.infer<typeof standardSettingsSchema>;
export function resolveStandardSettings(search: {
  settings?: string;
  columns?: string;
  compare?: string;
  basis?: "accrual" | "cash";
}): StandardSettings {
  if (search.settings) {
    const parsed = standardSettingsSchema.parse(JSON.parse(search.settings));
    return search.basis ? { ...parsed, basis: search.basis } : parsed;
  }
  return standardSettingsSchema.parse({
    basis: search.basis ?? "accrual",
    showTotal: search.compare !== "months",
    group:
      search.columns === "month" || search.columns === "quarter"
        ? search.columns
        : search.compare === "months"
          ? "month"
          : "total",
    compare:
      search.columns === "prior_period" || search.columns === "prior_year"
        ? search.columns
        : search.compare === "prior_month"
          ? "prior_period"
          : search.compare === "prior_year"
            ? "prior_year"
            : "none",
  });
}
export function encodeStandardSettings(settings: StandardSettings): string {
  const parsed = standardSettingsSchema.parse(settings),
    defaults = standardSettingsSchema.parse({});
  const encoded = JSON.stringify(
    Object.fromEntries(
      Object.entries(parsed).filter(
        ([key, value]) =>
          JSON.stringify(value) !== JSON.stringify(defaults[key as keyof StandardSettings]),
      ),
    ),
  );
  if (encodeURIComponent(encoded).length > 6000)
    throw new Error(
      "These settings exceed the link size limit. Shorten notes or reduce selected filter values before applying.",
    );
  return encoded;
}
