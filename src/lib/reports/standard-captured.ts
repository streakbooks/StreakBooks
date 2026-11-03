import { cashInputFromRows } from "./cash-source";
import { cashStandardFacts } from "./cash-standard";
import type { ReportingFacts, ReportDocument } from "./report-document";
import { accountMap, balancesToLines } from "@/lib/accounting/ledger-data";
import { buildBalanceSheet, buildProfitAndLoss } from "@/lib/accounting/reporting";
import { fromMinorUnits } from "@/lib/accounting/money";
import { addDaysIso } from "@/lib/accounting/fiscal-year";
import { buildPnlStatement, buildBalanceSheetStatement } from "./statements";
import { standardSettingsSchema } from "./standard-settings";
import { standardPeriods, standardStatementDocument } from "./standard-statement";
import { filterFingerprint, describeReportFilters } from "./report-filters";
export function buildCapturedStandardStatement(
  f: ReportingFacts,
  report: "profit-and-loss" | "balance-sheet",
  encoded: string,
): ReportDocument {
  const s = standardSettingsSchema.parse(JSON.parse(encoded));
  if (f.cashSource) {
    if (s.basis !== "cash" || f.cashSourceVersion !== 1)
      throw new Error("Cash source snapshot does not match the requested accounting basis");
    f = cashStandardFacts(f, cashInputFromRows(f.cashSource, f), s, report);
  }
  if (s.basis === "cash" && (f.basis !== "cash" || f.cashPolicy !== "settled-posted-documents-v1"))
    throw new Error(
      "Cash-basis facts were not captured by the cash recognition engine. Refresh the report; scheduled cash attachments require cash snapshot support.",
    );
  if (s.basis === "accrual" && f.basis === "cash")
    throw new Error("Cash facts cannot be rendered as accrual figures");
  const plan = standardPeriods(
    report,
    f.from,
    f.to,
    s,
    f.company.fyEndMonth,
    f.company.fyEndDay ?? 31,
  );
  const captured = f.standardColumns;
  if (
    !captured ||
    captured.length !== plan.periods.length ||
    captured.some(
      (p, i) =>
        p.from !== plan.periods[i]!.from ||
        p.to !== plan.periods[i]!.to ||
        p.label !== plan.periods[i]!.label ||
        (report === "balance-sheet" && p.fyStart !== p.from),
    )
  )
    throw new Error("Captured statement periods do not match the requested settings");
  if (
    (s.filters.clauses.length || f.appliedFilters?.clauses.length) &&
    (!f.appliedFilters || filterFingerprint(s.filters) !== filterFingerprint(f.appliedFilters))
  )
    throw new Error("Captured statement filters do not match the requested settings");
  const byId = accountMap(f.accounts),
    currency = f.company.baseCurrency;
  function lines(rows: ReportingFacts["period"], date: string, includeZero: boolean) {
    const balances = rows.map((r) => ({
      ...r,
      debit_minor: BigInt(r.debit_minor),
      credit_minor: BigInt(r.credit_minor),
    }));
    if (includeZero) {
      const present = new Set(balances.map((b) => b.account_id));
      for (const a of f.accounts)
        if (a.is_active && a.is_postable && !present.has(a.id))
          balances.push({ account_id: a.id, debit_minor: 0n, credit_minor: 0n, line_count: 0 });
    }
    return balancesToLines(balances, byId, date, currency);
  }
  const pnl =
    report === "profit-and-loss"
      ? captured.map((p) =>
          buildProfitAndLoss(lines(p.period, p.to, s.includeZero && !s.filters.clauses.length), {
            from: p.from,
            to: p.to,
          }),
        )
      : null;
  const bs =
    report === "balance-sheet"
      ? captured.map((p) =>
          buildBalanceSheet(
            [
              ...lines(p.bsPrior, addDaysIso(p.fyStart, -1), false),
              ...lines(p.bsCurrent, p.to, s.includeZero),
            ],
            { asOf: p.to, fyStart: p.fyStart },
          ),
        )
      : null;
  if (bs?.some((p) => !p.equationHolds))
    throw new Error(
      "Balance sheet does not reconcile; investigate posted journals before exporting",
    );
  const doc = standardStatementDocument({
    report,
    company: f.company.name,
    currency,
    from: f.from,
    to: f.to,
    settings: s,
    plan,
    lines: pnl ? buildPnlStatement(pnl) : buildBalanceSheetStatement(bs!),
    ...(pnl
      ? {
          denominators: pnl.map((p) =>
            s.percentBasis === "expense" ? p.expense : p.revenue + p.contraRevenue,
          ),
        }
      : { denominators: bs!.map((p) => p.assets) }),
    capturedAt: f.capturedAt,
  });
  doc.basis = s.basis;
  if (s.basis === "cash")
    doc.notes = [
      report === "balance-sheet"
        ? "Cash Balance Sheet: settled source net/tax/capital components are recognised with their posted cash movements. Posted opening positions and pure balance-sheet movements are carried forward. Noncash income/expense adjustments, depreciation and unrealised FX are excluded consistently with the cash P&L policy. Prior-year cash earnings are carried into equity; current-year cash earnings use each column’s fiscal year. This is management cash reporting, not a jurisdiction-specific tax return."
        : "Cash basis: posted receipts/payments are apportioned over their original posted source document components on the cash date. Unpaid documents and noncash credit allocations are excluded. Direct cash income/expenses are included; loans, transfers, capital purchases, depreciation, opening balances and unrealized FX are not operating cash income/expenses. Component FX rounding is reconciled to the bank movement. Advances, missing historical allocations and mixed-sign/inventory sources require review rather than estimated totals. This is management cash reporting, not a jurisdiction-specific tax return.",
      doc.notes,
    ]
      .filter(Boolean)
      .join("\n");
  const main = pnl?.[0],
    sheet = bs?.[0];
  doc.summary = (
    main
      ? ([
          ["Revenue", main.revenue + main.contraRevenue],
          ["Gross profit", main.grossProfit],
          ["Operating expenses", main.operatingExpense],
          ["Net profit", main.net],
        ] as const)
      : ([
          ["Assets", sheet!.assets],
          ["Liabilities", sheet!.liabilities],
          ["Equity", sheet!.equity],
          ["Current year earnings", sheet!.currentYearEarningsMinor ?? 0n],
        ] as const)
  ).map(([label, value]) => ({ label, value: fromMinorUnits(value, currency) }));
  if (s.filters.clauses.length) {
    doc.subtitle = [doc.subtitle, "Filtered report"].filter(Boolean).join(" · ");
    doc.notes = [
      `Report filters: ${describeReportFilters(s.filters, new Map(f.accounts.map((a) => [a.id, `${a.code} — ${a.name}`])))}`,
      doc.notes,
    ]
      .filter(Boolean)
      .join("\n");
  }
  return doc;
}
