import { addDaysIso, fiscalYearStart, shiftYear, monthStart } from "@/lib/accounting/fiscal-year";
import {
  monthColumns,
  quarterColumns,
  priorPeriodRange,
  priorYearRange,
  type StatementLine,
} from "./statements";
import { decimalPlacesFor, fromMinorUnits } from "@/lib/accounting/money";
import { decimalValue } from "./custom-definition";
import type { ReportDocument, DocumentRow } from "./report-document";
import type { StandardSettings } from "./standard-settings";
export type StandardPeriod = { label: string; from: string; to: string };
export function standardPeriods(
  report: "profit-and-loss" | "balance-sheet",
  from: string,
  to: string,
  s: StandardSettings,
  fyMonth: number,
  fyDay: number,
) {
  if (from > to || (Date.parse(to) - Date.parse(from)) / 86400000 > 3660)
    throw new Error("Choose a reporting period of at most ten years");
  if (
    report === "balance-sheet" &&
    ((s.incomePercent && !["assets", "row"].includes(s.percentBasis)) ||
      s.filters.clauses.length ||
      s.compare === "ytd" ||
      s.compare === "prior_ytd")
  )
    throw new Error("Income percentages and posted-line filters apply to Profit and Loss only");
  if (report === "profit-and-loss" && s.incomePercent && s.percentBasis === "assets")
    throw new Error("Asset percentages apply to Balance Sheet only");
  const periods: StandardPeriod[] = [
    { label: report === "balance-sheet" ? "As at" : "Selected period", from, to },
  ];
  const visible: number[] = [];
  if (s.group !== "total") {
    const buckets =
      s.group === "month"
        ? monthColumns(from, to, 25)
        : s.group === "quarter"
          ? quarterColumns(from, to, 25)
          : Array.from(
              { length: Number(to.slice(0, 4)) - Number(from.slice(0, 4)) + 1 },
              (_, i) => {
                const y = Number(from.slice(0, 4)) + i;
                return {
                  label: String(y),
                  from: `${y}-01-01` < from ? from : `${y}-01-01`,
                  to: `${y}-12-31` > to ? to : `${y}-12-31`,
                };
              },
            );
    if (buckets.length > 24)
      throw new Error(
        "Choose a shorter period or wider grouping; at most 24 period columns are supported",
      );
    for (const p of buckets) {
      periods.push(p);
      visible.push(periods.length - 1);
    }
  }
  if (s.group === "total" || (s.showTotal && report === "profit-and-loss")) visible.push(0);
  let comparison: number | null = null;
  if (s.compare !== "none") {
    const fy = fiscalYearStart(to, fyMonth, fyDay);
    const range =
      s.compare === "prior_period"
        ? report === "balance-sheet"
          ? { from: addDaysIso(monthStart(to), -1), to: addDaysIso(monthStart(to), -1) }
          : priorPeriodRange(from, to)
        : s.compare === "prior_year"
          ? priorYearRange(from, to)
          : s.compare === "ytd"
            ? { from: fy, to }
            : s.compare === "prior_ytd"
              ? { from: shiftYear(fy, -1), to: shiftYear(to, -1) }
              : { from: s.compareFrom!, to: s.compareTo! };
    if (report === "profit-and-loss" && range.from > range.to)
      throw new Error("Invalid comparison period");
    if ((Date.parse(range.to) - Date.parse(range.from)) / 86400000 > 3660)
      throw new Error("Comparison exceeds ten years");
    periods.push({
      label: {
        prior_period: "Previous period",
        prior_year: "Previous year",
        ytd: "Financial year to date",
        prior_ytd: "Previous financial year to date",
        custom: "Custom comparison",
      }[s.compare],
      ...range,
    });
    comparison = periods.length - 1;
    visible.push(comparison);
  }
  if (report === "balance-sheet")
    for (const p of periods) p.from = fiscalYearStart(p.to, fyMonth, fyDay);
  return { periods, visible, comparison };
}
export function standardStatementDocument(input: {
  report: "profit-and-loss" | "balance-sheet";
  company: string;
  currency: string;
  from: string;
  to: string;
  settings: StandardSettings;
  plan: ReturnType<typeof standardPeriods>;
  lines: StatementLine[];
  revenues?: bigint[];
  denominators?: bigint[];
  capturedAt: string;
}): ReportDocument {
  const { settings: s, plan, currency } = input;
  const columns: string[] = [],
    formats: Array<"money" | "percent"> = [];
  const label = (i: number) => {
    const p = plan.periods[i]!;
    return input.report === "balance-sheet"
      ? `${p.label} · ${p.to}`
      : `${p.label} · ${p.from} – ${p.to}`;
  };
  const percentageLabel = {
    income: "trading income",
    expense: "total expenses",
    row: "selected-period row",
    assets: "total assets",
  }[s.percentBasis];
  for (const i of plan.visible) {
    columns.push(label(i));
    formats.push("money");
    if (s.incomePercent) {
      columns.push(`${plan.periods[i]!.label} · % of ${percentageLabel}`);
      formats.push("percent");
    }
  }
  if (s.changeAmount) {
    columns.push("Change in amount");
    formats.push("money");
  }
  if (s.changePercent) {
    columns.push("Change %");
    formats.push("percent");
  }
  const percent = (n: bigint, d: bigint) =>
    d === 0n
      ? "Unavailable"
      : decimalValue({ n: (d < 0n ? -n : n).toString(), d: (d < 0n ? -d : d).toString() }, 2, 100n);
  let collapsed = false;
  const rows: DocumentRow[] = input.lines
    .filter((l) => {
      if (l.kind === "heading") collapsed = s.collapsedSections.includes(l.label);
      return l.kind !== "account" || !collapsed;
    })
    .filter((l) => s.detail !== "summary" || l.kind !== "account")
    .filter(
      (l) => s.includeZero || l.kind !== "account" || plan.visible.some((i) => l.amounts[i] !== 0n),
    )
    .map((l) => {
      const values: string[] = [];
      for (const i of plan.visible) {
        values.push(l.kind === "heading" ? "" : fromMinorUnits(l.amounts[i]!, currency));
        if (s.incomePercent)
          values.push(
            l.kind === "heading"
              ? ""
              : percent(
                  l.amounts[i]!,
                  s.percentBasis === "row"
                    ? l.amounts[0]!
                    : (input.denominators?.[i] ?? input.revenues?.[i] ?? 0n),
                ),
          );
      }
      if (s.changeAmount)
        values.push(
          l.kind === "heading"
            ? ""
            : fromMinorUnits(l.amounts[0]! - l.amounts[plan.comparison!]!, currency),
        );
      if (s.changePercent) {
        const previous = l.amounts[plan.comparison!]!;
        values.push(
          l.kind === "heading"
            ? ""
            : percent(l.amounts[0]! - previous, previous < 0n ? -previous : previous),
        );
      }
      return {
        label: s.accountCodes && l.code ? `${l.code} ${l.label}` : l.label,
        kind: l.kind,
        ...(l.accountId ? { accountId: l.accountId } : {}),
        values,
        format: "money",
        negative: s.negative,
        negativeRed: s.negativeRed,
        zero: s.zero,
        scale: s.scale,
        thousands: true,
        ...(s.currencySymbol ? { currencyPrefix: currency + " " } : {}),
        decimals: s.decimals === "currency" ? decimalPlacesFor(currency) : Number(s.decimals),
      };
    });
  return {
    title: input.report === "profit-and-loss" ? "Profit and Loss" : "Balance Sheet",
    company: input.company,
    currency,
    from: input.from,
    to: input.to,
    capturedAt: input.capturedAt,
    subtitle: [s.subtitle, s.scale !== "1" ? `Figures divided by ${s.scale}` : ""]
      .filter(Boolean)
      .join(" · "),
    header: s.header,
    footer: s.footer,
    notes: s.notes,
    orientation: columns.length > 4 ? "landscape" : "portrait",
    sections: [
      {
        id: input.report,
        title:
          input.report === "profit-and-loss" ? "Income, costs and profit" : "Financial position",
        columns,
        columnFormats: formats,
        rows,
        columnPeriods: plan.visible.flatMap((i) =>
          s.incomePercent ? [plan.periods[i]!, plan.periods[i]!] : [plan.periods[i]!],
        ),
        note: [
          s.showBasis ? "Accrual basis · posted ledger" : "",
          s.showCurrencyNote
            ? `All monetary figures in ${currency}; foreign transactions use their posted base-currency conversion.`
            : "",
          s.changePercent ? "Change % = (selected − comparison) / absolute comparison × 100." : "",
          rows.some((r) => r.values.includes("Unavailable"))
            ? "Unavailable means the denominator is zero; it is not a zero percentage."
            : "",
        ]
          .filter(Boolean)
          .join(" "),
      },
    ],
  };
}
