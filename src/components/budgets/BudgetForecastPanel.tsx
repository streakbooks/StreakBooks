import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, LineChart, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useFormat } from "@/hooks/use-format";
import { useActiveCompany } from "@/hooks/use-active-company";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  buildBudgetForecast,
  FORECAST_PRESETS,
  validateForecastAssumptions,
  type ForecastAssumptions,
  type ForecastMethod,
  type ForecastResult,
} from "@/lib/budgets/budget-forecast";
import { monthLabel } from "@/lib/budgets/budget-math";
import {
  deleteBudgetForecastScenario,
  getBudgetForecastData,
  saveBudgetForecastScenario,
  type ForecastSourceData,
} from "@/lib/budgets/budgets.functions";
import { csvFilename, csvMoney, downloadCsv, toCsv } from "@/lib/reports/csv";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LookupSelect } from "@/components/lookup";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type PresetName = keyof typeof FORECAST_PRESETS;
const PRESET_LABEL: Record<PresetName, string> = {
  conservative: "Conservative",
  base: "Base case",
  optimistic: "Optimistic",
};

function percentText(bps: number): string {
  return String(bps / 100);
}
function bpsFromPercent(text: string): number | null {
  const value = text.trim();
  if (!/^-?(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(value)) return null;
  const bps = Math.round(Number(value) * 100);
  if (!Number.isInteger(bps) || bps < -10000 || bps > 50000) return null;
  return bps;
}
function resultsFor(data: ForecastSourceData, assumptions: ForecastAssumptions): ForecastResult {
  return buildBudgetForecast({
    months: data.months,
    accounts: data.accounts,
    budget: data.budgetAmounts,
    actuals: data.actuals,
    completedIndex: data.completedIndex,
    assumptions,
  });
}

export function BudgetForecastPanel({
  companyId,
  budgetId,
  canManage,
  parentDirty,
}: {
  companyId: string;
  budgetId: string;
  canManage: boolean;
  parentDirty: boolean;
}) {
  const fmt = useFormat();
  const { company } = useActiveCompany();
  const queryClient = useQueryClient();
  const getFn = useServerFn(getBudgetForecastData);
  const saveFn = useServerFn(saveBudgetForecastScenario);
  const deleteFn = useServerFn(deleteBudgetForecastScenario);
  const [open, setOpen] = useState(false);
  const [cutoff, setCutoff] = useState<number | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [name, setName] = useState("Base forecast");
  const [notes, setNotes] = useState("");
  const [method, setMethod] = useState<ForecastMethod>("budget");
  const [incomeText, setIncomeText] = useState("0");
  const [expenseText, setExpenseText] = useState("0");
  const [dirty, setDirty] = useState(false);
  const [tableMode, setTableMode] = useState<"annual" | "monthly">("annual");
  const [accountFilter, setAccountFilter] = useState("");

  const query = useQuery({
    queryKey: ["budget-forecast", companyId, budgetId, cutoff],
    enabled: open,
    queryFn: () =>
      getFn({
        data: {
          companyId,
          budgetId,
          ...(cutoff === null ? {} : { completedIndex: cutoff }),
        },
      }),
  });
  const data = query.data;
  const selectedScenario = data?.scenarios.find((s) => s.id === savedId) ?? null;
  const incomeBps = bpsFromPercent(incomeText);
  const expenseBps = bpsFromPercent(expenseText);
  const assumptions = useMemo(() => {
    if (incomeBps === null || expenseBps === null) return null;
    try {
      return validateForecastAssumptions({ method, incomeBps, expenseBps });
    } catch {
      return null;
    }
  }, [incomeBps, expenseBps, method]);

  const computed = useMemo(() => {
    if (!data || !assumptions) return null;
    try {
      const active = resultsFor(data, assumptions);
      const comparisons = (Object.keys(FORECAST_PRESETS) as PresetName[]).map((preset) => ({
        name: PRESET_LABEL[preset],
        result: resultsFor(data, FORECAST_PRESETS[preset]),
      }));
      return { active, comparisons, error: null as string | null };
    } catch (cause) {
      return { active: null, comparisons: [], error: friendlyAuthError(cause) };
    }
  }, [data, assumptions]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const apply = (
    assumptions: ForecastAssumptions,
    title: string,
    newNotes = "",
    id: string | null = null,
  ) => {
    if (dirty && !window.confirm("Discard unsaved forecast assumptions?")) return;
    setSavedId(id);
    setName(title);
    setNotes(newNotes);
    setMethod(assumptions.method);
    setIncomeText(percentText(assumptions.incomeBps));
    setExpenseText(percentText(assumptions.expenseBps));
    setDirty(false);
  };
  const applyPreset = (preset: PresetName) => apply(FORECAST_PRESETS[preset], PRESET_LABEL[preset]);
  const chooseSaved = (id: string) => {
    const match = data?.scenarios.find((s) => s.id === id);
    if (!match) {
      if (!id) {
        if (dirty && !window.confirm("Discard unsaved forecast assumptions?")) return;
        setSavedId(null);
        setDirty(false);
      }
      return;
    }
    apply(
      {
        method: match.method,
        incomeBps: match.incomeBps,
        expenseBps: match.expenseBps,
      },
      match.name,
      match.notes ?? "",
      match.id,
    );
  };

  const save = useMutation({
    mutationFn: (asNew: boolean) => {
      if (!data?.scenariosAvailable || !canManage || parentDirty) {
        throw new Error("Save the main budget and enable scenario storage first.");
      }
      if (!assumptions) throw new Error("Correct percentage assumptions.");
      return saveFn({
        data: {
          companyId,
          budgetId,
          scenarioId: asNew ? null : savedId,
          expectedUpdatedAt: asNew ? null : (selectedScenario?.updatedAt ?? null),
          name,
          notes,
          ...assumptions,
        },
      });
    },
    onSuccess: async ({ id }) => {
      setSavedId(id);
      setDirty(false);
      await queryClient.invalidateQueries({ queryKey: ["budget-forecast", companyId, budgetId] });
      toast.success("Forecast scenario saved");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  const remove = useMutation({
    mutationFn: () => {
      if (!selectedScenario) throw new Error("Select a saved forecast to delete.");
      return deleteFn({
        data: {
          companyId,
          budgetId,
          scenarioId: selectedScenario.id,
          expectedUpdatedAt: selectedScenario.updatedAt,
        },
      });
    },
    onSuccess: async () => {
      setSavedId(null);
      setDirty(false);
      await queryClient.invalidateQueries({ queryKey: ["budget-forecast", companyId, budgetId] });
      toast.success("Saved forecast deleted; the approved budget was not changed");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  const report = computed?.active;
  const money = (value: number) => fmt.money(value, data?.currency ?? fmt.baseCurrency);
  const filtered =
    report?.accounts.filter((row) =>
      (row.code + " " + row.name)
        .toLocaleLowerCase()
        .includes(accountFilter.trim().toLocaleLowerCase()),
    ) ?? [];
  const exportCsv = () => {
    if (!data || !report) return;
    const rows = report.accounts.map((row) => [
      row.code,
      row.name,
      row.kind,
      ...row.months.flatMap((cell) => [
        csvMoney(cell.budgetMinor, data.currency),
        csvMoney(cell.forecastMinor, data.currency),
        cell.source,
      ]),
      csvMoney(row.baselineMinor, data.currency),
      csvMoney(row.projectedMinor, data.currency),
      csvMoney(row.differenceMinor, data.currency),
    ]);
    const headers = [
      "Account code",
      "Account name",
      "Type",
      ...report.months.flatMap((month) => [
        monthLabel(month) + " original budget",
        monthLabel(month) + " actual or forecast",
        monthLabel(month) + " source",
      ]),
      "Annual original budget",
      "Annual forecast",
      "Difference",
    ];
    downloadCsv(
      csvFilename("budget-forecast-" + name, data.budget.fiscal_year_start),
      toCsv(
        {
          company: company?.name ?? "",
          report: "Budget forecast — " + name,
          period:
            data.budget.fiscal_year_start + " through " + report.months[report.months.length - 1],
          currency: data.currency,
          basis:
            "Accrual, company base currency. Completed months use posted actuals; " +
            "future months use " +
            method +
            " with income " +
            incomeText +
            "% and expenses " +
            expenseText +
            "%. " +
            "What-if only: no ledger or approved budget changes.",
        },
        headers,
        rows,
      ),
    );
  };

  const toggle = () => {
    if (open && dirty && !window.confirm("Close and discard unsaved forecast assumptions?")) return;
    if (open) setDirty(false);
    setOpen(!open);
  };
  const validSave = Boolean(
    data?.scenariosAvailable &&
    canManage &&
    !parentDirty &&
    assumptions &&
    name.trim().length >= 3 &&
    name.trim().length <= 100 &&
    notes.trim().length <= 1000,
  );
  return (
    <section
      className="mt-6 space-y-4 rounded-lg border p-4"
      aria-label="Budget forecast scenarios"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <LineChart className="size-4" /> Forecasting and scenarios
          </h2>
          <p className="text-sm text-muted-foreground">
            Combine completed-month actuals with budget-driven or run-rate forecasts. Explore
            scenarios without changing the approved budget or posting journals.
          </p>
        </div>
        <Button variant="outline" size="sm" type="button" aria-expanded={open} onClick={toggle}>
          {open ? "Hide forecast" : "Open forecasting"}
        </Button>
      </div>

      {open ? (
        query.isPending ? (
          <p className="text-sm text-muted-foreground">Loading fiscal budget and posted actuals…</p>
        ) : query.isError ? (
          <Alert variant="destructive">
            <AlertDescription>
              Could not load forecasting data: {friendlyAuthError(query.error)}.
              <Button
                variant="outline"
                size="sm"
                className="ml-2"
                onClick={() => void query.refetch()}
              >
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        ) : data ? (
          <>
            {!data.scenariosAvailable ? (
              <Alert>
                <AlertDescription>
                  Forecast preview and CSV export are available. Saving named scenarios requires
                  database migration 20261106214000_budget_forecast_scenarios.sql.
                </AlertDescription>
              </Alert>
            ) : null}
            {parentDirty ? (
              <Alert>
                <AlertDescription>
                  Forecasts use the last saved budget, not unsaved edits in the main grid. Save or
                  discard those changes before saving a named forecast.
                </AlertDescription>
              </Alert>
            ) : null}
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="space-y-1">
                <Label htmlFor="forecast-cutoff">Actuals through</Label>
                <RecordLookupSelect
                  id="forecast-cutoff"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={cutoff === null ? "latest" : String(cutoff)}
                  onValueChange={(e) => setCutoff(e === "latest" ? null : Number(e))}
                >
                  <option value="latest">Latest completed month</option>
                  <option value="-1">No completed months</option>
                  {data.months.slice(0, data.maxCompletedIndex + 1).map((month, index) => (
                    <option key={month} value={index}>
                      {monthLabel(month)}
                    </option>
                  ))}
                </RecordLookupSelect>
              </div>
              <div className="space-y-1">
                <Label htmlFor="forecast-method">Forecast future months from</Label>
                <select
                  id="forecast-method"
                  value={method}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  onChange={(e) => {
                    setMethod(e.target.value as ForecastMethod);
                    setDirty(true);
                  }}
                >
                  <option value="budget">Remaining monthly budget</option>
                  <option value="run_rate">Average of last 3 completed months</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="forecast-income-percent">Future income adjustment (%)</Label>
                <Input
                  id="forecast-income-percent"
                  type="number"
                  step="0.25"
                  min={-100}
                  max={500}
                  value={incomeText}
                  aria-invalid={incomeBps === null}
                  onChange={(e) => {
                    setIncomeText(e.target.value);
                    setDirty(true);
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="forecast-expense-percent">Future expense adjustment (%)</Label>
                <Input
                  id="forecast-expense-percent"
                  type="number"
                  step="0.25"
                  min={-100}
                  max={500}
                  value={expenseText}
                  aria-invalid={expenseBps === null}
                  onChange={(e) => {
                    setExpenseText(e.target.value);
                    setDirty(true);
                  }}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Quick scenarios:</span>
              {(Object.keys(FORECAST_PRESETS) as PresetName[]).map((preset) => (
                <Button
                  type="button"
                  key={preset}
                  size="sm"
                  variant="outline"
                  disabled={save.isPending || remove.isPending}
                  onClick={() => applyPreset(preset)}
                >
                  {PRESET_LABEL[preset]}
                </Button>
              ))}
            </div>
            {!assumptions ? (
              <Alert variant="destructive">
                <AlertDescription>
                  Enter income and expense adjustments between -100% and +500%, with at most two
                  decimal places.
                </AlertDescription>
              </Alert>
            ) : null}
            {computed?.error ? (
              <Alert variant="destructive">
                <AlertDescription>{computed.error}</AlertDescription>
              </Alert>
            ) : null}
            {report ? (
              <>
                <p className="text-xs text-muted-foreground">
                  {report.completedMonths} completed actual month(s) · {report.projectedMonths}{" "}
                  projected month(s). The current partial month is not treated as final.
                  {report.noHistoryCells > 0
                    ? " The run-rate method falls back to budget values where no completed months exist."
                    : ""}
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {(
                    [
                      ["Income", report.totals.income],
                      ["Expenses", report.totals.expense],
                      ["Projected net profit", report.totals.net],
                    ] as const
                  ).map(([label, t]) => (
                    <div className="rounded-md border p-3" key={label}>
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="mt-1 text-lg font-semibold tabular-nums">
                        {money(t.projectedMinor)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Original: {money(t.budgetMinor)}
                      </p>
                      <p
                        className={
                          "text-xs tabular-nums " +
                          (t.varianceMinor < 0 ? "text-destructive" : "text-emerald-600")
                        }
                      >
                        Favourable difference: {money(t.varianceMinor)}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Scenario comparison</h3>
                  <p className="text-xs text-muted-foreground">
                    Each column compares the full financial-year result using the same completed
                    actuals. These are planning assumptions, not promises of revenue.
                  </p>
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Scenario</TableHead>
                          <TableHead className="text-right">Income forecast</TableHead>
                          <TableHead className="text-right">Expense forecast</TableHead>
                          <TableHead className="text-right">Net profit forecast</TableHead>
                          <TableHead className="text-right">Net vs original</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[
                          ...computed!.comparisons,
                          {
                            name: "Current assumptions" + (savedId ? " (saved)" : ""),
                            result: report,
                          },
                        ].map((entry, index) => (
                          <TableRow key={index}>
                            <TableCell>{entry.name}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {money(entry.result.totals.income.projectedMinor)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {money(entry.result.totals.expense.projectedMinor)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {money(entry.result.totals.net.projectedMinor)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {money(entry.result.totals.net.varianceMinor)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="forecast-account-search">Account search</Label>
                    <Input
                      id="forecast-account-search"
                      value={accountFilter}
                      onChange={(e) => setAccountFilter(e.target.value)}
                      placeholder="Account code or name"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      type="button"
                      onClick={() => setTableMode(tableMode === "annual" ? "monthly" : "annual")}
                    >
                      {tableMode === "annual" ? "Show monthly projection" : "Show annual summary"}
                    </Button>
                    <Button size="sm" variant="outline" type="button" onClick={exportCsv}>
                      <Download className="mr-2 size-4" /> Export complete CSV
                    </Button>
                  </div>
                </div>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      {tableMode === "annual" ? (
                        <TableRow>
                          <TableHead>Account</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead className="text-right">Original budget</TableHead>
                          <TableHead className="text-right">Actual + forecast</TableHead>
                          <TableHead className="text-right">Difference</TableHead>
                        </TableRow>
                      ) : (
                        <TableRow>
                          <TableHead className="sticky left-0 bg-background">Account</TableHead>
                          {report.months.map((m, i) => (
                            <TableHead className="min-w-28 text-right" key={m}>
                              {monthLabel(m)}
                              <span className="block text-xs text-muted-foreground">
                                {i < report.completedMonths ? "Actual" : "Projected"}
                              </span>
                            </TableHead>
                          ))}
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      )}
                    </TableHeader>
                    <TableBody>
                      {filtered.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={tableMode === "annual" ? 5 : 14}
                            className="text-sm text-muted-foreground"
                          >
                            No accounts match this search.
                          </TableCell>
                        </TableRow>
                      ) : (
                        filtered.map((row) =>
                          tableMode === "annual" ? (
                            <TableRow key={row.accountId}>
                              <TableCell>
                                {row.code} · {row.name}
                              </TableCell>
                              <TableCell className="capitalize">{row.kind}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                {money(row.baselineMinor)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {money(row.projectedMinor)}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {money(row.differenceMinor)}
                              </TableCell>
                            </TableRow>
                          ) : (
                            <TableRow key={row.accountId}>
                              <TableCell className="sticky left-0 bg-background">
                                {row.code} · {row.name}
                              </TableCell>
                              {row.months.map((month) => (
                                <TableCell
                                  key={month.month}
                                  className="text-right tabular-nums"
                                  title={month.source.replace(/_/g, " ")}
                                >
                                  {money(month.forecastMinor)}
                                </TableCell>
                              ))}
                              <TableCell className="text-right font-semibold tabular-nums">
                                {money(row.projectedMinor)}
                              </TableCell>
                            </TableRow>
                          ),
                        )
                      )}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-xs text-muted-foreground">
                  Account search changes the visible detail rows only. Summary cards and scenario
                  comparisons always include every account. Export includes all account rows, even
                  those filtered out of the current table.
                </p>
              </>
            ) : null}
            <div className="space-y-3 rounded-md border p-3">
              <h3 className="font-semibold">Save and manage named scenarios</h3>
              <p className="text-xs text-muted-foreground">
                Named scenarios store assumptions only and recalculate against latest posted actuals
                when opened. They do not alter budget approvals or journals.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="forecast-saved-select">Saved scenarios</Label>
                  <LookupSelect
                    id="forecast-saved-select"
                    ariaLabel="Saved forecast scenario"
                    value={savedId ?? ""}
                    allowClear
                    onChange={chooseSaved}
                    options={data.scenarios.map((s) => ({
                      id: s.id,
                      name: s.name,
                      label: s.name,
                    }))}
                    placeholder="Select saved forecast"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="forecast-scenario-name">Scenario name</Label>
                  <Input
                    id="forecast-scenario-name"
                    value={name}
                    maxLength={100}
                    onChange={(e) => {
                      setName(e.target.value);
                      setDirty(true);
                    }}
                    disabled={!canManage}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="forecast-scenario-notes">Planning notes</Label>
                <Textarea
                  id="forecast-scenario-notes"
                  value={notes}
                  rows={2}
                  maxLength={1000}
                  onChange={(e) => {
                    setNotes(e.target.value);
                    setDirty(true);
                  }}
                  disabled={!canManage}
                  placeholder="Assumptions, risks, management commentary"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  type="button"
                  disabled={!validSave || save.isPending || (savedId !== null && !dirty)}
                  onClick={() => save.mutate(false)}
                >
                  <Save className="mr-2 size-4" />
                  {savedId ? "Update saved scenario" : "Save new scenario"}
                </Button>
                {savedId ? (
                  <>
                    <Button
                      size="sm"
                      type="button"
                      variant="outline"
                      disabled={
                        !validSave ||
                        save.isPending ||
                        name.trim().toLocaleLowerCase() ===
                          selectedScenario?.name.toLocaleLowerCase()
                      }
                      title="Enter a different scenario name to save a separate copy"
                      onClick={() => save.mutate(true)}
                    >
                      Save as new
                    </Button>
                    <Button
                      size="sm"
                      type="button"
                      variant="destructive"
                      disabled={!canManage || remove.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Delete this named forecast? Its audit history will remain.",
                          )
                        ) {
                          remove.mutate();
                        }
                      }}
                    >
                      <Trash2 className="mr-2 size-4" /> Delete scenario
                    </Button>
                  </>
                ) : null}
                {dirty ? (
                  <span className="text-xs text-muted-foreground">
                    Unsaved forecast assumptions
                  </span>
                ) : null}
              </div>
              {selectedScenario ? (
                <p className="text-xs text-muted-foreground">
                  Selected version saved {fmt.dateTime(selectedScenario.updatedAt)}. A conflicting
                  update requires reloading before another save.
                </p>
              ) : null}
              {data.events.length > 0 ? (
                <details className="rounded-md border p-3">
                  <summary className="cursor-pointer text-sm font-medium">
                    Saved-scenario audit history ({data.events.length}
                    {data.events.length === 50 ? "+" : ""} most recent)
                  </summary>
                  <div className="mt-3 max-h-64 overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Scenario</TableHead>
                          <TableHead>Action</TableHead>
                          <TableHead>When</TableHead>
                          <TableHead>Recorded by</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.events.map((event) => (
                          <TableRow key={event.id}>
                            <TableCell>{event.name}</TableCell>
                            <TableCell className="capitalize">{event.action}</TableCell>
                            <TableCell>{fmt.dateTime(event.recordedAt)}</TableCell>
                            <TableCell className="font-mono text-xs">
                              {event.recordedBy?.slice(0, 8) ?? "Former user"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </details>
              ) : null}
            </div>
          </>
        ) : null
      ) : null}
    </section>
  );
}
