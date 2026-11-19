import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeftRight, Download } from "lucide-react";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useFormat } from "@/hooks/use-format";
import { monthLabel } from "@/lib/budgets/budget-math";
import type { ScenarioCell, ScenarioRow, ScenarioSection } from "@/lib/budgets/budget-scenarios";
import { compareBudgetScenarios, type BudgetSummary } from "@/lib/budgets/budgets.functions";
import { csvFilename, csvMoney, downloadCsv, toCsv } from "@/lib/reports/csv";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { LoadingState } from "@/components/common/states";
import { LookupSelect } from "@/components/lookup";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function varianceClass(cell: ScenarioCell): string {
  if (cell.status === "favourable") return "text-emerald-600";
  if (cell.status === "unfavourable") return "text-destructive";
  return "";
}

/** Two-budget, same-organisation comparison; no ledger or budget mutations. */
export function BudgetScenarioComparison({
  companyId,
  budgets,
}: {
  companyId: string;
  budgets: BudgetSummary[];
}) {
  const { company } = useActiveCompany();
  const fmt = useFormat();
  const compareFn = useServerFn(compareBudgetScenarios);
  const [baselineChoice, setBaselineChoice] = useState("");
  const [scenarioChoice, setScenarioChoice] = useState("");
  const [focus, setFocus] = useState("annual");
  const [search, setSearch] = useState("");
  const [changedOnly, setChangedOnly] = useState(false);

  const baselineId =
    budgets.find((budget) => budget.id === baselineChoice)?.id ?? budgets[0]?.id ?? "";
  const scenarioId =
    budgets.find((budget) => budget.id === scenarioChoice && budget.id !== baselineId)?.id ??
    budgets.find((budget) => budget.id !== baselineId)?.id ??
    "";
  const options = budgets.map((budget) => ({
    id: budget.id,
    name: budget.name,
    label: budget.name,
    description: budget.fiscal_year_start,
    keywords: `${budget.name} ${budget.fiscal_year_start}`,
  }));
  const reportQuery = useQuery({
    queryKey: ["budget-scenario-comparison", companyId, baselineId, scenarioId],
    enabled: Boolean(companyId && baselineId && scenarioId && baselineId !== scenarioId),
    queryFn: () => compareFn({ data: { companyId, baselineId, scenarioId } }),
  });

  const data = reportQuery.data;
  const comparison = data?.comparison;
  const selectedCell = (row: { annual: ScenarioCell; months: ScenarioCell[] }): ScenarioCell =>
    focus === "annual" ? row.annual : (row.months[Number(focus)] ?? row.annual);
  const money = (minor: number) => fmt.money(minor, data?.currency ?? fmt.baseCurrency);
  const matches = (row: ScenarioRow) => {
    const text = `${row.code} ${row.name}`.toLocaleLowerCase();
    return (
      text.includes(search.trim().toLocaleLowerCase()) &&
      (!changedOnly || selectedCell(row).varianceMinor !== 0)
    );
  };
  const baselinePeriod =
    !data || focus === "annual" ? "Full year" : monthLabel(data.baselineMonths[Number(focus)]!);
  const scenarioPeriod =
    !data || focus === "annual" ? "Full year" : monthLabel(data.scenarioMonths[Number(focus)]!);

  const exportComparison = () => {
    if (!data || !comparison) return;
    const headers = [
      "Account code",
      "Account name",
      "Type",
      ...data.baselineMonths.flatMap((month, index) => [
        `${monthLabel(month)} baseline`,
        `${monthLabel(data.scenarioMonths[index]!)} comparison`,
        `Fiscal month ${index + 1} favourable variance`,
      ]),
      "Annual baseline",
      "Annual comparison",
      "Annual favourable variance",
    ];
    const columns = (row: { annual: ScenarioCell; months: ScenarioCell[] }) => [
      ...row.months.flatMap((cell) => [
        csvMoney(cell.baselineMinor, data.currency),
        csvMoney(cell.scenarioMinor, data.currency),
        csvMoney(cell.varianceMinor, data.currency),
      ]),
      csvMoney(row.annual.baselineMinor, data.currency),
      csvMoney(row.annual.scenarioMinor, data.currency),
      csvMoney(row.annual.varianceMinor, data.currency),
    ];
    const group = (label: string, section: ScenarioSection): string[][] => [
      ...section.rows.map((row) => [row.code, row.name, label, ...columns(row)]),
      ["", `Total ${label.toLowerCase()}`, label, ...columns(section)],
    ];
    const csv = toCsv(
      {
        company: company?.name ?? "",
        report: "Budget scenario comparison",
        period: `${data.baselineBudget.fiscal_year_start} versus ${data.scenarioBudget.fiscal_year_start}`,
        currency: data.currency,
        basis: "Fiscal months aligned by position. Positive favourable variance.",
      },
      headers,
      [
        ...group("Income", comparison.income),
        ...group("Expenses", comparison.expense),
        ["", "Budgeted net profit", "Net", ...columns(comparison.net)],
      ],
    );
    downloadCsv(
      csvFilename("budget-scenario-comparison", data.baselineBudget.fiscal_year_start),
      csv,
    );
  };

  const tableCells = (cell: ScenarioCell, emphasize = false) => (
    <>
      <TableCell className={`text-right tabular-nums ${emphasize ? "font-semibold" : ""}`}>
        {money(cell.baselineMinor)}
      </TableCell>
      <TableCell className={`text-right tabular-nums ${emphasize ? "font-semibold" : ""}`}>
        {money(cell.scenarioMinor)}
      </TableCell>
      <TableCell
        className={`text-right tabular-nums ${varianceClass(cell)} ${emphasize ? "font-semibold" : ""}`}
      >
        {money(cell.varianceMinor)}
      </TableCell>
      <TableCell className={`text-right tabular-nums ${varianceClass(cell)}`}>
        {cell.variancePctBps === null ? "—" : fmt.percentBps(cell.variancePctBps)}
      </TableCell>
    </>
  );
  const sectionRows = (label: string, section: ScenarioSection) => (
    <>
      <TableRow className="bg-muted/40">
        <TableCell colSpan={5} className="text-xs font-semibold uppercase tracking-wide">
          {label}
        </TableCell>
      </TableRow>
      {section.rows.filter(matches).map((row) => (
        <TableRow key={row.id}>
          <TableCell className="min-w-44">
            <span className="mr-2 text-muted-foreground">{row.code}</span>
            {row.name}
          </TableCell>
          {tableCells(selectedCell(row))}
        </TableRow>
      ))}
      <TableRow>
        <TableCell className="font-semibold">Total {label.toLowerCase()}</TableCell>
        {tableCells(selectedCell(section), true)}
      </TableRow>
    </>
  );

  return (
    <section
      className="my-6 space-y-4 rounded-lg border p-4"
      aria-label="Budget scenario comparison"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Compare budget scenarios</h2>
          <p className="text-sm text-muted-foreground">
            Compare any two budgets by account, financial year or fiscal month.
          </p>
        </div>
        <Button size="sm" variant="outline" disabled={!data} onClick={exportComparison}>
          <Download className="mr-2 size-4" />
          Export comparison CSV
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1 space-y-1">
          <Label htmlFor="scenario-baseline">Baseline budget</Label>
          <LookupSelect
            id="scenario-baseline"
            ariaLabel="Baseline budget"
            options={options}
            value={baselineId}
            onChange={setBaselineChoice}
            allowClear={false}
            placeholder="Choose baseline"
          />
        </div>
        <Button
          size="icon"
          variant="outline"
          aria-label="Swap baseline and comparison budgets"
          title="Swap baseline and comparison budgets"
          onClick={() => {
            setBaselineChoice(scenarioId);
            setScenarioChoice(baselineId);
          }}
        >
          <ArrowLeftRight className="size-4" />
        </Button>
        <div className="min-w-48 flex-1 space-y-1">
          <Label htmlFor="scenario-comparison">Comparison budget</Label>
          <LookupSelect
            id="scenario-comparison"
            ariaLabel="Comparison budget"
            options={options.filter((option) => option.id !== baselineId)}
            value={scenarioId}
            onChange={setScenarioChoice}
            allowClear={false}
            placeholder="Choose comparison"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="scenario-month">Period</Label>
          <select
            id="scenario-month"
            className="flex h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={focus}
            onChange={(event) => setFocus(event.target.value)}
          >
            <option value="annual">Full financial year</option>
            {Array.from({ length: 12 }, (_, i) => (
              <option value={String(i)} key={i}>
                Fiscal month {i + 1}
                {data
                  ? ` (${monthLabel(data.baselineMonths[i]!)} / ${monthLabel(data.scenarioMonths[i]!)})`
                  : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {reportQuery.isPending ? (
        <LoadingState />
      ) : reportQuery.isError ? (
        <QueryErrorState queries={[reportQuery]} title="Could not compare budgets" />
      ) : data && comparison ? (
        <>
          <Alert>
            <AlertDescription>
              Baseline: {data.baselineBudget.name} (
              {fmt.date(data.baselineBudget.fiscal_year_start)}){" · "}Comparison:{" "}
              {data.scenarioBudget.name} ({fmt.date(data.scenarioBudget.fiscal_year_start)}). Months
              are aligned by fiscal-month position, not by calendar date. Positive variance means
              higher income, lower expense or improved net profit.
            </AlertDescription>
          </Alert>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: "Income change", cell: selectedCell(comparison.income) },
              { label: "Expense improvement", cell: selectedCell(comparison.expense) },
              { label: "Net profit improvement", cell: selectedCell(comparison.net) },
            ].map(({ label, cell }) => (
              <div className="rounded-md border p-3" key={label}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`mt-1 text-lg font-semibold tabular-nums ${varianceClass(cell)}`}>
                  {money(cell.varianceMinor)}
                </p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-1">
              <Label htmlFor="scenario-account-search">Find account</Label>
              <Input
                id="scenario-account-search"
                placeholder="Account code or name"
                value={search}
                className="w-64 max-w-full"
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="scenario-changed-only"
                checked={changedOnly}
                onCheckedChange={(value) => setChangedOnly(value === true)}
              />
              <Label htmlFor="scenario-changed-only">Changed accounts only</Label>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {comparison.accountCount} account(s) across both budgets. The totals always include all
            accounts, including historical accounts no longer postable, regardless of filters.
          </p>
          {comparison.accountCount === 0 ? (
            <Alert>
              <AlertDescription>
                Both budgets are empty. Add monthly amounts to compare.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-right">Baseline: {baselinePeriod}</TableHead>
                    <TableHead className="text-right">Comparison: {scenarioPeriod}</TableHead>
                    <TableHead className="text-right">Favourable variance</TableHead>
                    <TableHead className="text-right">Variance %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sectionRows("Income", comparison.income)}
                  {sectionRows("Expenses", comparison.expense)}
                  <TableRow className="border-t-2">
                    <TableCell className="font-semibold">Budgeted net profit</TableCell>
                    {tableCells(selectedCell(comparison.net), true)}
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}
