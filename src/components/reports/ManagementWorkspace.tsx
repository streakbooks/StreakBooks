import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getManagementMetrics,
  getReportingWorkspace,
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
}: {
  companyId: string;
  from: string;
  to: string;
}) {
  const client = useQueryClient(),
    fetch = useServerFn(getManagementMetrics),
    list = useServerFn(getReportingWorkspace),
    save = useServerFn(saveReportingModel);
  const [start, setStart] = useState(from),
    [end, setEnd] = useState(to),
    [widgets, setWidgets] = useState<Array<(typeof KPI_IDS)[number]>>([...KPI_IDS]),
    [name, setName] = useState("Management dashboard");
  const [activeModel, setActiveModel] = useState<{ id: string; version: number } | null>(null);
  const q = useQuery({
    queryKey: ["management-metrics", companyId, start, end],
    queryFn: () => fetch({ data: { companyId, from: start, to: end } }),
    retry: false,
  });
  const saved = useQuery({
    queryKey: ["reporting-workspace", companyId],
    queryFn: async () =>
      JSON.parse(await list({ data: { companyId } })) as {
        models: Array<{
          id: string;
          name: string;
          kind: string;
          config: { widgets?: Array<(typeof KPI_IDS)[number]> };
          version: number;
        }>;
      },
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
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="management-to">To</Label>
          <Input
            id="management-to"
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
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
          <RecordLookupSelect
            aria-label="Open saved dashboard"
            className="h-9 rounded border bg-background"
            defaultValue=""
            onValueChange={(e) => {
              const model = saved.data?.models.find((m) => m.id === e);
              if (model) {
                const parsed = dashboardSchema.safeParse(model.config);
                if (!parsed.success) {
                  toast.error("This saved dashboard configuration is invalid.");
                  return;
                }
                setName(model.name);
                setWidgets(parsed.data.widgets);
                setActiveModel({ id: model.id, version: model.version });
              }
            }}
          >
            <option value="">Open saved dashboard</option>
            {saved.data?.models
              .filter((m) => m.kind === "dashboard")
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
          </RecordLookupSelect>
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
                  search={{ from: start, to: end }}
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
            from={start}
            to={end}
            currency={q.data.company.baseCurrency}
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
}: {
  companyId: string;
  from: string;
  to: string;
  currency: string;
}) {
  const client = useQueryClient(),
    calculate = useServerFn(previewForecast),
    save = useServerFn(saveReportingModel),
    list = useServerFn(getReportingWorkspace);
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
  const models = useQuery({
    queryKey: ["reporting-workspace", companyId],
    queryFn: async () =>
      JSON.parse(await list({ data: { companyId } })) as {
        models: Array<{
          id: string;
          name: string;
          kind: string;
          config: ForecastConfig;
          version: number;
        }>;
      },
  });
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
  const current = config.scenarios.find((s) => s.id === scenario) ?? config.scenarios[0]!;
  const output = preview.data?.find((s) => s.scenario.id === current.id);
  const money = (s: string | null) =>
    s === null ? "No completed-month actual" : fromMinorUnits(BigInt(s), currency);
  return (
    <section className="space-y-4 rounded-lg border p-4">
      <h2 className="text-xl font-semibold">Forecasts & scenarios</h2>
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
        <RecordLookupSelect
          className="h-9 rounded border bg-background"
          aria-label="Open forecast assumptions"
          defaultValue=""
          onValueChange={(e) => {
            const m = models.data?.models.find((m) => m.id === e);
            if (m) {
              const parsed = forecastSchema.safeParse(m.config);
              if (!parsed.success) {
                toast.error("This saved forecast configuration is invalid.");
                return;
              }
              setConfig(parsed.data);
              setName(m.name);
              setScenario(parsed.data.scenarios[0]!.id);
              setActiveModel({ id: m.id, version: m.version });
              preview.reset();
            }
          }}
        >
          <option value="">Open saved forecast</option>
          {models.data?.models
            .filter((m) => m.kind === "forecast")
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
        </RecordLookupSelect>
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
      <div className="flex gap-2">
        <Button disabled={preview.isPending} onClick={() => preview.mutate()}>
          Calculate forecast
        </Button>
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
      {output && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="p-2">Month</th>
                <th className="p-2">Projected revenue</th>
                <th className="p-2">Projected expenses</th>
                <th className="p-2">Projected profit</th>
                <th className="p-2">Actual revenue</th>
                <th className="p-2">Revenue variance</th>
              </tr>
            </thead>
            <tbody>
              {output.rows.map((r) => (
                <tr key={r.month} className="border-t">
                  <td className="p-2">{r.month}</td>
                  <td className="p-2">{money(r.projectedRevenueMinor)}</td>
                  <td className="p-2">{money(r.projectedExpenseMinor)}</td>
                  <td className="p-2">{money(r.projectedProfitMinor)}</td>
                  <td className="p-2">{money(r.actualRevenueMinor)}</td>
                  <td className="p-2">
                    {r.revenueVarianceMinor === null
                      ? "Unavailable"
                      : money(r.revenueVarianceMinor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
