import {
  addDaysIso,
  addMonthsIso,
  monthStart,
  monthEnd,
  previousFiscalYear,
  fiscalYearStart,
} from "@/lib/accounting/fiscal-year";
export const PERIOD_PRESETS = [
  ["today", "Today"],
  ["this_week", "This week"],
  ["last_week", "Last week"],
  ["this_month", "This month"],
  ["last_month", "Last month"],
  ["this_quarter", "This calendar quarter"],
  ["last_quarter", "Last calendar quarter"],
  ["calendar_ytd", "Calendar year to date"],
  ["financial_ytd", "Financial year to date"],
  ["last_year", "Last calendar year"],
  ["last_fy", "Last financial year"],
] as const;
export function reportPeriod(
  preset: string,
  today: string,
  fyMonth = 12,
  fyDay = 31,
): { from: string; to: string } {
  const year = today.slice(0, 4),
    month = monthStart(today);
  const quarter = `${year}-${String(Math.floor((Number(today.slice(5, 7)) - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
  const monday = addDaysIso(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "this_week":
      return { from: monday, to: addDaysIso(monday, 6) };
    case "last_week":
      return { from: addDaysIso(monday, -7), to: addDaysIso(monday, -1) };
    case "this_month":
      return { from: month, to: monthEnd(today) };
    case "last_month":
      return { from: addMonthsIso(month, -1), to: addDaysIso(month, -1) };
    case "this_quarter":
      return { from: quarter, to: monthEnd(addMonthsIso(quarter, 2)) };
    case "last_quarter":
      return { from: addMonthsIso(quarter, -3), to: addDaysIso(quarter, -1) };
    case "calendar_ytd":
      return { from: `${year}-01-01`, to: today };
    case "financial_ytd":
      return { from: fiscalYearStart(today, fyMonth, fyDay), to: today };
    case "last_year":
      return { from: `${Number(year) - 1}-01-01`, to: `${Number(year) - 1}-12-31` };
    case "last_fy": {
      const fy = previousFiscalYear(today, fyMonth, fyDay);
      return { from: fy.start, to: fy.end };
    }
    default:
      throw new Error("Unknown reporting period preset");
  }
}
