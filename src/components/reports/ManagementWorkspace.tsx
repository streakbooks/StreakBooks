import { StatementBasisSelect } from "./StatementBasisSelect";
import type { AccountingBasis } from "@/lib/reports/accounting-basis";
import { useReportingCentreOrigin } from "@/lib/reports/centre-return";
import { useCanDo } from "@/hooks/use-can";
import { exportForecast } from "@/lib/reports/forecast-export.functions";
import { downloadReportFile } from "@/lib/reports/download";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ForecastComparison } from "./ForecastComparison";
import { ReportingModelSelect } from "./ReportingModelSelect";
import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getManagementMetrics,
  saveReportingModel,
  previewForecast,
} from "@/lib/reports/ecosystem.functions";
import { KPI_DEFINITIONS } from "@/lib/reports/management";
import {
  KPI_IDS,
  dashboardSchema,
  forecastSchema,
  type ForecastConfig,
} from "@/lib/reports/ecosystem-model";
import { fromMinorUnits } from "@/lib/accounting/money";
import { addMonthsIso, monthStart, monthEnd } from "@/lib/accounting/fiscal-year";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LoadingState, ErrorState, EmptyState } from "@/components/common/states";
export function ManagementWorkspace({
  companyId,
  from,
  to,
  onPeriodChange,
}: {
  companyId: string;
  from: string;
  to: string;
  onPeriodChange: (range: { from: string; to: string }) => void;
}) {
  const centre = useReportingCentreOrigin();
  const client = useQueryClient(),
    fetch = useServerFn(getManagementMetrics),
    save = useServerFn(saveReportingModel);
  const [widgets, setWidgets] = useState<Array<(typeof KPI_IDS)[number]>>([...KPI_IDS]),
    [name, setName] = useState("Management dashboard");
  const [activeModel, setActiveModel] = useState<{ id: string; version: number } | null>(null);
  const q = useQuery({
    queryKey: ["management-metrics", companyId, from, to],
    queryFn: () => fetch({ data: { companyId, from, to } }),
    retry: false,
  });
  const saving = useMutation({
    mutationFn: () =>
      save({ data: { companyId, name, kind: "dashboard", config: { widgets }, ...activeModel } }),
    onSuccess: async (result) => {
      setActiveModel({
        id: (JSON.parse(result) as { id: string }).id,
        version: activeModel ? activeModel.version + 1 : 1,
      });
      await client.invalidateQueries({ queryKey: ["reporting-workspace", companyId] });
      toast.success("Dashboard saved");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Management dashboard</h2>
        <p className="text-sm text-muted-foreground">
          Financial measures from the posted ledger. Unavailable ratios remain blank when a
          denominator is not positive.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="management-from">From</Label>
          <Input
            id="management-from"
            type="date"
            value={from}
            onChange={(e) => e.target.value && onPeriodChange({ from: e.target.value, to })}
          />
        </div>
        <div>
          <Label htmlFor="management-to">To</Label>
          <Input
            id="management-to"
            type="date"
            value={to}
            onChange={(e) => e.target.value && onPeriodChange({ from, to: e.target.value })}
          />
        </div>
        <Button variant="outline" onClick={() => void q.refetch()}>
          Refresh financials
        </Button>
      </div>
      <div className="space-y-3 rounded border p-4">
        <h3 className="font-semibold">Dashboard configuration</h3>
        <div className="flex flex-wrap gap-3">
          {KPI_IDS.map((id) => (
            <label key={id} className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={widgets.includes(id)}
                onChange={(e) =>
                  setWidgets(e.target.checked ? [...widgets, id] : widgets.filter((v) => v !== id))
                }
              />
              {id.replaceAll("_", " ")}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Input
            aria-label="Dashboard name"
            className="max-w-xs"
            value={name}
            maxLength={160}
            onChange={(e) => setName(e.target.value)}
          />
          <Button
            disabled={saving.isPending || !widgets.length || !name.trim()}
            onClick={() => saving.mutate()}
          >
            {activeModel ? "Update dashboard" : "Save dashboard"}
          </Button>
          {activeModel && (
            <Button
              variant="outline"
              onClick={() => {
                setActiveModel(null);
                setName(`${name.slice(0, 150)} (copy)`);
              }}
            >
              Save as new
            </Button>
          )}
          <ReportingModelSelect
            companyId={companyId}
            kind="dashboard"
            label="Open saved dashboard"
            revision={String(activeModel?.version ?? "")}
            onSelect={(model) => {
              const parsed = dashboardSchema.safeParse(model.config);
              if (!parsed.success) {
                toast.error("This saved dashboard configuration is invalid.");
                return;
              }
              setName(model.name);
              setWidgets(parsed.data.widgets);
              setActiveModel({ id: model.id, version: model.version });
            }}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {widgets.map((id, i) => (
            <Button
              key={id}
              variant="ghost"
              size="sm"
              disabled={!i}
              onClick={() =>
                setWidgets((prev) => {
                  const next = [...prev];
                  [next[i - 1], next[i]] = [next[i]!, next[i - 1]!];
                  return next;
                })
              }
            >
              ← {id.replaceAll("_", " ")}
            </Button>
          ))}
        </div>
      </div>
      {q.isPending ? (
        <LoadingState />
      ) : q.isError ? (
        <ErrorState
          title="Could not load management metrics"
          description={friendlyAuthError(q.error)}
          onRetry={() => void q.refetch()}
        />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {q.data.accountingBasis === "cash" ? "Cash" : "Accrual"} basis
          </p>
          {!q.data.hasActivity && (
            <EmptyState
              title="No posted activity in this period"
              description="The values below show the current ledger balances. Add and post transactions to see financial performance."
            />
          )}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {widgets.map((id) => {
              const metric = q.data.metrics[id];
              return (
                <Link
                  key={id}
                  to="/reports/$reportId"
                  params={{ reportId: metric.reportId }}
                  search={{ from, to, basis: q.data.accountingBasis, centre }}
                  className="space-y-2 rounded-lg border p-4 transition-shadow hover:shadow-md"
                >
                  <h3 className="text-sm font-medium capitalize text-muted-foreground">
                    {id.replaceAll("_", " ")}
                  </h3>
                  <p className="text-2xl font-semibold tabular-nums">
                    {metric.value === null
                      ? "Unavailable"
                      : metric.format === "money"
                        ? `${q.data.company.baseCurrency} ${fromMinorUnits(BigInt(metric.value), q.data.company.baseCurrency)}`
                        : metric.format === "percent"
                          ? `${Number(metric.value) / 100}%`
                          : `${Number(metric.value) / 10000}×`}
                  </p>
                  <p className="text-xs text-muted-foreground">{KPI_DEFINITIONS[id]}</p>
                </Link>
              );
            })}
          </div>
          <ForecastWorkspace
            companyId={companyId}
            from={from}
            to={to}
            currency={q.data.company.baseCurrency}
            accountingBasis={q.data.accountingBasis}
          />
        </>
      )}
    </div>
  );
}
function ForecastWorkspace({
  companyId,
  from,
  to,
  currency,
  accountingBasis,
}: {
  companyId: string;
  from: string;
  to: string;
  currency: string;
  accountingBasis: AccountingBasis;
}) {
  const client = useQueryClient(),
    calculate = useServerFn(previewForecast),
    exportFn = useServerFn(exportForecast),
    save = useServerFn(saveReportingModel);
  const [config, setConfig] = useState<ForecastConfig>({
    start: addMonthsIso(monthStart(to), 1),
    months: 12,
    baselineFrom: monthStart(from),
    baselineTo: monthEnd(to),
    scenarios: [
      {
        id: "base",
        name: "Base case",
        revenueGrowthBps: 0,
        expenseGrowthBps: 0,
        assumptions:
          "Historical monthly average, with no growth. Collections, working-capital movements and financing are not modeled.",
      },
      {
        id: "best",
        name: "Higher growth",
        revenueGrowthBps: 500,
        expenseGrowthBps: 200,
        assumptions: "Revenue grows 5% per month and expenses grow 2% per month.",
      },
      {
        id: "worst",
        name: "Lower growth",
        revenueGrowthBps: -500,
        expenseGrowthBps: 200,
        assumptions: "Revenue declines 5% per month and expenses grow 2% per month.",
      },
    ],
  });
  const [activeModel, setActiveModel] = useState<{ id: string; version: number } | null>(null);
  const [name, setName] = useState("Operating forecast"),
    [scenario, setScenario] = useState("base");
  const preview = useMutation({
    mutationFn: () => calculate({ data: { companyId, config } }),
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  const saving = useMutation({
    mutationFn: () => save({ data: { companyId, name, kind: "forecast", config, ...activeModel } }),
    onSuccess: async (result) => {
      setActiveModel({
        id: (JSON.parse(result) as { id: string }).id,
        version: activeModel ? activeModel.version + 1 : 1,
      });
      await client.invalidateQueries({ queryKey: ["reporting-workspace", companyId] });
      toast.success("Forecast assumptions saved");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  const canExport = useCanDo("reports.export");
  const exporting = useMutation({
    mutationFn: (format: "pdf" | "xlsx" | "csv") =>
      exportFn({ data: { companyId, config, name, format } }),
    onSuccess: downloadReportFile,
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const current = config.scenarios.find((s) => s.id === scenario) ?? config.scenarios[0]!;
  const output = preview.data?.find((s) => s.scenario.id === current.id);
  return (
    <section className="space-y-4 rounded-lg border p-4">
      <h2 className="text-xl font-semibold">Forecasts & scenarios</h2>
      <StatementBasisSelect
        basis={config.basis ?? accountingBasis}
        report="profit-and-loss"
        onChange={(basis) => {
          setConfig({ ...config, basis });
          preview.reset();
        }}
      />
      <p className="text-sm text-muted-foreground">
        Projected operating results use the average of complete baseline months and compound the
        stated growth each month. These projections do not predict cash balances.
      </p>
      <div className="flex flex-wrap gap-3">
        <Input
          aria-label="Forecast name"
          className="max-w-xs"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <ReportingModelSelect
          companyId={companyId}
          kind="forecast"
          label="Open forecast assumptions"
          revision={String(activeModel?.version ?? "")}
          onSelect={(model) => {
            const parsed = forecastSchema.safeParse(model.config);
            if (!parsed.success) {
              toast.error("This saved forecast configuration is invalid.");
              return;
            }
            setConfig(parsed.data);
            setName(model.name);
            setScenario(parsed.data.scenarios[0]!.id);
            setActiveModel({ id: model.id, version: model.version });
            preview.reset();
          }}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        {(
          [
            ["baselineFrom", "Baseline from"],
            ["baselineTo", "Baseline to"],
            ["start", "Forecast start"],
          ] as const
        ).map(([key, label]) => (
          <div key={key}>
            <Label htmlFor={`forecast-${key}`}>{label}</Label>
            <Input
              id={`forecast-${key}`}
              type="date"
              value={config[key]}
              onChange={(e) => {
                setConfig({ ...config, [key]: e.target.value });
                preview.reset();
              }}
            />
          </div>
        ))}
        <div>
          <Label htmlFor="forecast-months">Months</Label>
          <Input
            id="forecast-months"
            type="number"
            min={1}
            max={36}
            value={config.months}
            onChange={(e) => {
              setConfig({ ...config, months: Number(e.target.value) });
              preview.reset();
            }}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Label htmlFor="forecast-scenario">Scenario</Label>
        <RecordLookupSelect
          id="forecast-scenario"
          className="h-9 rounded border bg-background"
          value={current.id}
          onValueChange={(e) => setScenario(e)}
        >
          {config.scenarios.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </RecordLookupSelect>
        <Button
          variant="outline"
          onClick={() => {
            setConfig({ ...config, start: addMonthsIso(config.start, 1) });
            preview.reset();
          }}
        >
          Roll forecast forward one month
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            ["revenueGrowthBps", "Monthly revenue growth (basis points)"],
            ["expenseGrowthBps", "Monthly expense growth (basis points)"],
          ] as const
        ).map(([key, label]) => (
          <div key={key}>
            <Label htmlFor={`forecast-${key}`}>{label}</Label>
            <Input
              id={`forecast-${key}`}
              type="number"
              min={-10000}
              max={100000}
              value={current[key]}
              onChange={(e) => {
                setConfig({
                  ...config,
                  scenarios: config.scenarios.map((s) =>
                    s.id === current.id ? { ...s, [key]: Number(e.target.value) } : s,
                  ),
                });
                preview.reset();
              }}
            />
          </div>
        ))}
      </div>
      <Label htmlFor="forecast-assumptions">Scenario assumptions</Label>
      <Textarea
        id="forecast-assumptions"
        value={current.assumptions}
        onChange={(e) => {
          setConfig({
            ...config,
            scenarios: config.scenarios.map((s) =>
              s.id === current.id ? { ...s, assumptions: e.target.value } : s,
            ),
          });
          preview.reset();
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button disabled={preview.isPending} onClick={() => preview.mutate()}>
          Calculate forecast
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              disabled={!canExport || !preview.data || exporting.isPending || !name.trim()}
            >
              {exporting.isPending ? "Preparing forecast…" : "Download forecast"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {(
              [
                ["pdf", "PDF document"],
                ["xlsx", "Excel workbook (.xlsx)"],
                ["csv", "CSV data (.csv)"],
              ] as const
            ).map(([format, label]) => (
              <DropdownMenuItem key={format} onSelect={() => exporting.mutate(format)}>
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="outline"
          disabled={saving.isPending || !preview.data || !name.trim()}
          onClick={() => saving.mutate()}
        >
          {activeModel ? "Update assumptions" : "Save assumptions"}
        </Button>
        {activeModel && (
          <Button
            variant="outline"
            onClick={() => {
              setActiveModel(null);
              setName(`${name.slice(0, 150)} (copy)`);
            }}
          >
            Save as new
          </Button>
        )}
      </div>
      {preview.isPending && <LoadingState />}
      {preview.isError && (
        <p role="alert" className="text-sm text-destructive">
          {friendlyAuthError(preview.error)}
        </p>
      )}
      {output && <ForecastComparison output={output} currency={currency} />}
    </section>
  );
}
