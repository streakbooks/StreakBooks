import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, GitCompareArrows, RefreshCw } from "lucide-react";
import { addDaysIso, addMonthsIso } from "@/lib/accounting/fiscal-year";
import { monthLabel } from "@/lib/budgets/budget-math";
import { getBudgetDimensionVariance } from "@/lib/budgets/budget-dimension-variance.functions";
import type {
  DimensionVarianceCell,
  DimensionVarianceRow,
} from "@/lib/budgets/budget-dimension-variance";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { csvFilename, csvMoney, downloadCsv, toCsv } from "@/lib/reports/csv";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useFormat } from "@/hooks/use-format";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LookupSelect } from "@/components/lookup";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function BudgetDimensionVariancePanel({
  companyId,
  budgetId,
  categoryId,
  fiscalMonths,
}: {
  companyId: string;
  budgetId: string;
  categoryId: string;
  fiscalMonths: readonly string[];
}) {
  const fmt = useFormat();
  const { company } = useActiveCompany();
  const getFn = useServerFn(getBudgetDimensionVariance);
  const [open, setOpen] = useState(false);
  const [throughChoice, setThroughChoice] = useState("");
  const [viewMonth, setViewMonth] = useState("ytd");
  const [optionChoice, setOptionChoice] = useState("all");
  const [search, setSearch] = useState("");
  const [showUnassigned, setShowUnassigned] = useState(true);
  const today = new Date().toISOString().slice(0, 10);
  const currentMonth = today.slice(0, 7) + "-01";
  const allowedMonths = fiscalMonths.filter((m) => addDaysIso(addMonthsIso(m, 1), -1) < today);
  const canShowPartial = fiscalMonths.includes(currentMonth);
  const query = useQuery({
    queryKey: ["budget-dimension-variance", companyId, budgetId, categoryId, throughChoice],
    enabled: open,
    queryFn: () =>
      getFn({
        data: {
          companyId,
          budgetId,
          categoryId,
          ...(throughChoice ? { through: throughChoice } : {}),
        },
      }),
  });
  const data = query.data;
  const report = data?.report;
  const chosenMonth = Number(viewMonth);
  const selectedCell = (row: { months: DimensionVarianceCell[]; ytd: DimensionVarianceCell }) =>
    viewMonth === "ytd" ? row.ytd : (row.months[chosenMonth] ?? row.ytd);
  const differenceClass = (c: DimensionVarianceCell) =>
    c.status === "favourable"
      ? "text-emerald-600"
      : c.status === "unfavourable"
        ? "text-destructive"
        : "";
  const money = (v: number) => fmt.money(v, data?.currency ?? fmt.baseCurrency);
  const options = (report?.summaries ?? []).map((option) => ({
    id: option.optionId ?? "__unassigned__",
    name: option.optionName,
    label: option.optionName,
  }));
  const optionChosen =
    optionChoice === "all" || options.some((o) => o.id === optionChoice) ? optionChoice : "all";
  const matches = (row: DimensionVarianceRow) => {
    if (!showUnassigned && row.optionId === null) return false;
    if (optionChosen !== "all" && (row.optionId ?? "__unassigned__") !== optionChosen) return false;
    const term = search.trim().toLocaleLowerCase();
    return !term || `${row.accountCode} ${row.accountName}`.toLocaleLowerCase().includes(term);
  };
  const shownSummaries =
    report?.summaries.filter(
      (item) =>
        (showUnassigned || item.optionId !== null) &&
        (optionChosen === "all" || (item.optionId ?? "__unassigned__") === optionChosen),
    ) ?? [];
  const filteredRows = report?.rows.filter(matches) ?? [];

  const exportCsv = () => {
    if (!report || !data) return;
    const headers = [
      "Tracking option",
      "Account code",
      "Account name",
      "Type",
      ...report.months.flatMap((month) => [
        `${monthLabel(month)} budget`,
        `${monthLabel(month)} posted actual`,
        `${monthLabel(month)} favourable variance`,
      ]),
      "YTD budget",
      "YTD actual",
      "YTD favourable variance",
      "YTD variance %",
    ];
    const cells = (c: DimensionVarianceCell) => [
      csvMoney(c.budgetMinor, data.currency),
      csvMoney(c.actualMinor, data.currency),
      csvMoney(c.varianceMinor, data.currency),
    ];
    const content = toCsv(
      {
        company: company?.name ?? "",
        report: `Budget vs posted actuals: ${data.categoryName}`,
        period: `${data.fiscalStart} through ${data.through}`,
        currency: data.currency,
        basis:
          "Accrual; direct journal-line tracking assignments; unassigned lines separate. " +
          (data.partialMonth
            ? "Current month has partial actuals versus its full-month budget."
            : "Only completed financial months included."),
      },
      headers,
      filteredRows.map((row) => {
        const name =
          report.summaries.find((item) => item.optionId === row.optionId)?.optionName ??
          "Unassigned";
        return [
          name,
          row.accountCode,
          row.accountName,
          row.kind,
          ...row.months.flatMap(cells),
          ...cells(row.ytd),
          row.ytd.variancePctBps === null ? "" : String(row.ytd.variancePctBps / 100),
        ];
      }),
    );
    downloadCsv(csvFilename(`budget-actual-${data.categoryName}`, data.fiscalStart), content);
  };

  return (
    <section
      className="mt-5 space-y-3 border-t pt-4"
      aria-label="Tracking dimension budget versus actual"
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <GitCompareArrows className="mr-2 size-4" />
        {open ? "Hide budget vs actual" : "View budget vs actual"}
      </Button>
      {open ? (
        <>
          <p className="text-sm text-muted-foreground">
            Accrual actuals use posted journal lines in the company base currency. Only explicit
            journal-line tracking tags are attributed to an option. Unassigned lines are shown
            separately; document-level tags are not automatically attributed to all underlying
            journal lines.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="dim-report-through">As of</Label>
              <RecordLookupSelect
                id="dim-report-through"
                className="flex h-10 border-input px-3"
                value={throughChoice}
                onValueChange={(nextValue) => setThroughChoice(nextValue)}
              >
                <option value="">Latest completed month (default)</option>
                {canShowPartial ? (
                  <option value={today}>Today — partial current month</option>
                ) : null}
                {allowedMonths.map((m) => (
                  <option key={m} value={addDaysIso(addMonthsIso(m, 1), -1)}>
                    Through {monthLabel(m)}
                  </option>
                ))}
              </RecordLookupSelect>
            </div>
            <div className="space-y-1">
              <Label htmlFor="dim-report-view">View</Label>
              <RecordLookupSelect
                id="dim-report-view"
                value={viewMonth}
                onValueChange={(nextValue) => setViewMonth(nextValue)}
                className="flex h-10 border-input px-3"
              >
                <option value="ytd">Year to date</option>
                {(report?.months ?? []).map((m, i) => (
                  <option key={m} value={String(i)}>
                    {monthLabel(m)}
                  </option>
                ))}
              </RecordLookupSelect>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={query.isPending}
              onClick={() => void query.refetch()}
            >
              <RefreshCw className="mr-2 size-4" /> Refresh actuals
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!report}
              onClick={exportCsv}
            >
              <Download className="mr-2 size-4" /> Export shown rows
            </Button>
          </div>
          {query.isPending ? (
            <p className="text-sm text-muted-foreground">Loading posted journal actuals…</p>
          ) : query.isError ? (
            <Alert variant="destructive">
              <AlertDescription>
                Could not load dimension actuals: {friendlyAuthError(query.error)}
              </AlertDescription>
            </Alert>
          ) : report && data ? (
            <>
              {report.months.length === 0 ? (
                <Alert>
                  <AlertDescription>This financial year has not started yet.</AlertDescription>
                </Alert>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    From {fmt.date(data.fiscalStart)} to {fmt.date(data.through)} ·
                    {report.assignedLines} line(s) assigned to this category ·
                    {report.unassignedLines} unassigned posted P&amp;L line(s). Totals do not
                    include future months.
                  </p>
                  {data.partialMonth ? (
                    <Alert>
                      <AlertDescription>
                        Current-month actuals are partial through {fmt.date(data.through)}, but the
                        current-month budget is the full month. Variances may change until month
                        end. Select a completed month for a consistent comparison.
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  {report.unassignedLines > 0 ? (
                    <Alert>
                      <AlertDescription>
                        {report.unassignedLines} posted income/expense line(s) lack a direct
                        tracking assignment in this category. Review the Unassigned group before
                        interpreting class or location performance.
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="min-w-48 flex-1 space-y-1">
                      <Label htmlFor="dim-report-option">Tracking option</Label>
                      <LookupSelect
                        id="dim-report-option"
                        ariaLabel="Filter tracking option"
                        value={optionChosen}
                        onChange={setOptionChoice}
                        options={[
                          {
                            id: "all",
                            name: "All tracking options",
                            label: "All tracking options",
                          },
                          ...options,
                        ]}
                        allowClear={false}
                      />
                    </div>
                    <div className="min-w-48 flex-1 space-y-1">
                      <Label htmlFor="dim-report-search">Account search</Label>
                      <Input
                        id="dim-report-search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Account code or name"
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={showUnassigned}
                        onChange={(e) => setShowUnassigned(e.target.checked)}
                      />
                      Include unassigned
                    </label>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {shownSummaries.map((option) => {
                      const inc = selectedCell(option.income);
                      const exp = selectedCell(option.expense);
                      const net = selectedCell(option.net);
                      return (
                        <div
                          key={option.optionId ?? "unassigned"}
                          className="rounded-md border p-3"
                        >
                          <p className="font-semibold">{option.optionName}</p>
                          <div className="mt-2 space-y-1 text-xs tabular-nums">
                            <div className="flex justify-between gap-2">
                              <span>Income actual / budget</span>
                              <span>
                                {money(inc.actualMinor)} / {money(inc.budgetMinor)}
                              </span>
                            </div>
                            <div className="flex justify-between gap-2">
                              <span>Expense actual / budget</span>
                              <span>
                                {money(exp.actualMinor)} / {money(exp.budgetMinor)}
                              </span>
                            </div>
                            <div className="flex justify-between gap-2 border-t pt-1 font-medium">
                              <span>Net-profit favourable variance</span>
                              <span className={differenceClass(net)}>
                                {money(net.varianceMinor)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Option</TableHead>
                          <TableHead>Account</TableHead>
                          <TableHead className="text-right">Budget</TableHead>
                          <TableHead className="text-right">Posted actual</TableHead>
                          <TableHead className="text-right">Favourable variance</TableHead>
                          <TableHead className="text-right">Variance %</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredRows.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-sm text-muted-foreground">
                              No budget allocations or tagged posted lines match these filters.
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredRows.map((row) => {
                            const c = selectedCell(row);
                            const optionName =
                              report.summaries.find((s) => s.optionId === row.optionId)
                                ?.optionName ?? "Unassigned";
                            return (
                              <TableRow key={`${row.optionId ?? "none"}|${row.accountId}`}>
                                <TableCell>{optionName}</TableCell>
                                <TableCell>
                                  <span className="mr-2 text-muted-foreground">
                                    {row.accountCode}
                                  </span>
                                  {row.accountName}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {money(c.budgetMinor)}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {money(c.actualMinor)}
                                </TableCell>
                                <TableCell
                                  className={`text-right tabular-nums ${differenceClass(c)}`}
                                >
                                  {money(c.varianceMinor)}
                                </TableCell>
                                <TableCell
                                  className={`text-right tabular-nums ${differenceClass(c)}`}
                                >
                                  {c.variancePctBps === null
                                    ? "—"
                                    : fmt.percentBps(c.variancePctBps)}
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Account search filters detail rows only. Summary cards always include all
                    matching option accounts, and unassigned lines are not included in the totals
                    for an assigned option.
                  </p>
                </>
              )}
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
