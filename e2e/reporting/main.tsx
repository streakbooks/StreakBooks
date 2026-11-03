import { StatementBasisSelect } from "@/components/reports/StatementBasisSelect";
import { cashStandardFacts } from "@/lib/reports/cash-standard";
import { cashInputFixture } from "@/lib/reports/__fixtures__/cash-facts";
import { ForecastComparison } from "@/components/reports/ForecastComparison";
import { forecastProjection } from "@/lib/reports/management";
import { forecastSchema } from "@/lib/reports/ecosystem-model";
import { ReportCatalogue } from "@/components/reports/ReportCatalogue";
import { useRouterState, useNavigate } from "@tanstack/react-router";
import { StandardReportControls } from "@/components/reports/StandardReportControls";
import { ReportPeriodSelect } from "@/components/reports/ReportPeriodSelect";
import { standardSettingsSchema, encodeStandardSettings } from "@/lib/reports/standard-settings";
import { standardPeriods } from "@/lib/reports/standard-statement";
import { ReportActionsMenu } from "@/components/reports/ReportActionsMenu";
import { parseReportingCentreSearch } from "@/lib/reports/centre-search";
import { ReportActivityList } from "../../src/components/reports/ReportActivityList";
import { parseReportSearch } from "../../src/lib/reports/search";
// Browser harness for real designer/renderer/lookup components. API persistence and RLS use the separate live SQL suite.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { CustomReportDesigner } from "../../src/components/reports/CustomReportDesigner";
import { DocumentPreview } from "../../src/components/reports/DocumentPreview";
import { LookupSelect } from "../../src/components/lookup/LookupSelect";
import { useLookupQuery } from "../../src/components/lookup/use-lookup-query";
import { RecordLookupSelect } from "../../src/components/lookup/RecordLookupSelect";
import {
  customDefinitionSchema,
  starterDefinition,
  customColumns,
  type CustomDefinition,
} from "../../src/lib/reports/custom-definition";
import { buildReportDocument, type ReportDocument } from "../../src/lib/reports/report-document";
import { reportingFactsFixture } from "../../src/lib/reports/__fixtures__/facts";
import type { LookupOption } from "../../src/lib/lookup/types";
import "../../src/styles.css";
export function Fixture() {
  const [definition, setDefinition] = useState<CustomDefinition>(() => {
    const stored = localStorage.getItem("reporting-designer");
    return stored
      ? customDefinitionSchema.parse(JSON.parse(stored))
      : starterDefinition("Board review");
  });
  const [document, setDocument] = useState<ReportDocument | null>(null),
    [error, setError] = useState(""),
    [saved, setSaved] = useState("");
  const [value, setValue] = useState(""),
    [unsaved, setUnsaved] = useState("Keep this unsaved note"),
    [created, setCreated] = useState<LookupOption[]>([]),
    [createName, setCreateName] = useState("");
  const [declaration, setDeclaration] = useState("b");
  const lookup = useLookupQuery<LookupOption>({
    companyId: "fixture-company",
    kind: "fixture-accounts",
    pageSize: 50,
    fetchPage: async ({ query, page, pageSize }) => {
      await new Promise((r) => setTimeout(r, query === "slow" ? 650 : 20));
      const all = Array.from({ length: 10000 }, (_, i) => ({
        id: `account-${i}`,
        label: `Account ${i}`,
        name: `Account ${i}`,
        code: String(i).padStart(5, "0"),
        group: i % 2 ? "Income" : "Expense",
        companyId: "fixture-company",
      }));
      const matching = all.filter((o) =>
        (o.code + " " + o.label).toLowerCase().includes(query.toLowerCase()),
      );
      return {
        rows: matching.slice(page * pageSize, (page + 1) * pageSize),
        hasMore: matching.length > (page + 1) * pageSize,
      };
    },
  });
  function preview() {
    try {
      const def = customDefinitionSchema.parse(definition),
        f = reportingFactsFixture();
      if (def.filters.clauses.length)
        throw new Error("Filtered financial previews are verified by the live database suite");
      f.customColumns = customColumns(def, f.from, f.to).map((c) => ({
        id: c.id,
        from: c.from,
        to: c.to,
        balances: c.from === f.from && c.to === f.to ? f.period : [],
      }));
      setDocument(buildReportDocument(f, { name: def.title, config: { _builder: def } }));
      setError("");
    } catch (e) {
      setDocument(null);
      setError(e instanceof Error ? e.message : "Invalid definition");
    }
  }
  return (
    <main className="mx-auto max-w-6xl space-y-8 p-4">
      <section aria-label="Standard report actions fixture" className="flex justify-end">
        <ReportActionsMenu from="2026-04-01" to="2026-11-02" />
      </section>
      <CatalogueFixture />
      {window.location.pathname === "/cash-fixture" && <CashBasisFixture />}
      <ForecastComparisonFixture />
      <StandardStatementFixture />
      <ActivityFixture />
      <h1 className="text-2xl font-semibold">Reporting and LookupSelect verification</h1>
      <section className="space-y-3 rounded border p-4">
        <h2 className="font-semibold">Originating form</h2>
        <label>
          Unsaved parent note
          <input
            className="ml-2 rounded border p-2"
            aria-label="Unsaved parent note"
            value={unsaved}
            onChange={(e) => setUnsaved(e.target.value)}
          />
        </label>
        <LookupSelect
          ariaLabel="Large account lookup"
          companyId="fixture-company"
          value={value}
          onChange={setValue}
          options={[...created, ...lookup.rows]}
          search={lookup.query}
          onSearchChange={lookup.setQuery}
          clientFilter={false}
          loading={lookup.loading}
          error={lookup.error}
          onRetry={lookup.retry}
          hasMore={lookup.hasMore}
          onLoadMore={lookup.loadMore}
          canCreate
          renderCreate={(ctx) => (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const option = {
                  id: crypto.randomUUID(),
                  label: createName || ctx.initialQuery,
                  companyId: "fixture-company",
                };
                setCreated((prev) => [...prev, option]);
                ctx.complete(option);
              }}
            >
              <label>
                New account name
                <input
                  aria-label="New lookup record name"
                  value={createName || ctx.initialQuery}
                  onChange={(e) => setCreateName(e.target.value)}
                />
              </label>
              <button type="submit">Save new lookup record</button>
              <button type="button" onClick={ctx.close}>
                Cancel record creation
              </button>
            </form>
          )}
        />
        <p role="status">Selected lookup id: {value || "none"}</p>
        <RecordLookupSelect
          aria-label="Migrated declaration"
          value={declaration}
          onValueChange={setDeclaration}
        >
          <option value="">All records</option>
          <option value="a">Alpha record</option>
          <option value="b">Beta record</option>
          <option value="disabled" disabled>
            Restricted record
          </option>
        </RecordLookupSelect>
      </section>
      <CustomReportDesigner
        filterOptions={{ currencies: ["GBP", "USD"], sources: ["manual"] }}
        definition={definition}
        onChange={(d) => {
          setDefinition(d);
          setDocument(null);
          setError("");
          setSaved("");
        }}
        accounts={reportingFactsFixture().accounts}
      />
      <div className="flex gap-3">
        <button className="rounded border p-2" onClick={preview}>
          Recalculate report preview
        </button>
        <button
          className="rounded border p-2"
          disabled={!customDefinitionSchema.safeParse(definition).success}
          onClick={() => {
            localStorage.setItem(
              "reporting-designer",
              JSON.stringify(customDefinitionSchema.parse(definition)),
            );
            setSaved("Configuration saved in the isolated fixture");
          }}
        >
          Persist fixture configuration
        </button>
      </div>
      {saved && <p role="status">{saved}</p>}
      {error && <p role="alert">{error}</p>}
      {document && <DocumentPreview document={document} />}
    </main>
  );
}
function StandardStatementFixture() {
  const [settings, setSettings] = useState(() =>
    standardSettingsSchema.parse(
      JSON.parse(localStorage.getItem("standard-fixture-settings") ?? "{}"),
    ),
  );
  const [period, setPeriod] = useState({ from: "2026-10-01", to: "2026-10-31" });
  const [doc, setDoc] = useState<ReportDocument | null>(null);
  const [error, setError] = useState("");
  return (
    <section aria-label="Standard statement fixture" className="space-y-3 rounded border p-4">
      <h2 className="font-semibold">Standard statement controls</h2>
      <div className="flex flex-wrap items-end gap-3">
        <ReportPeriodSelect {...period} fyMonth={3} fyDay={31} onChange={setPeriod} />
        <StandardReportControls
          report="profit-and-loss"
          settings={settings}
          onApply={(s) => {
            setSettings(s);
            setDoc(null);
          }}
          accounts={reportingFactsFixture().accounts}
          filterOptions={{ currencies: ["GBP", "USD"], sources: ["manual"] }}
        />
      </div>
      <button
        className="rounded border px-3 py-2"
        onClick={() => {
          try {
            if (settings.filters.clauses.length)
              throw new Error(
                "Filtered financial previews are verified by the live database suite",
              );
            const f = reportingFactsFixture();
            const plan = standardPeriods("profit-and-loss", f.from, f.to, settings, 12, 31);
            f.standardColumns = plan.periods.map((p) => ({
              ...p,
              fyStart: "2026-01-01",
              period: p.from === f.from && p.to === f.to ? f.period : [],
              bsPrior: [],
              bsCurrent: f.bsCurrent,
            }));
            f.appliedFilters = settings.filters;
            setDoc(
              buildReportDocument(f, {
                name: "Profit and Loss",
                reportId: "profit-and-loss",
                config: { settings: encodeStandardSettings(settings) },
              }),
            );
            setError("");
          } catch (e) {
            setDoc(null);
            setError(e instanceof Error ? e.message : "Invalid settings");
          }
        }}
      >
        Run standard statement fixture
      </button>
      <button
        className="ml-2 rounded border px-3 py-2"
        onClick={() =>
          localStorage.setItem("standard-fixture-settings", encodeStandardSettings(settings))
        }
      >
        Persist standard statement settings
      </button>
      {error && <p role="alert">{error}</p>}
      {doc && <DocumentPreview document={doc} compact={settings.compact} />}
    </section>
  );
}
function CashBasisFixture() {
  const [report, setReport] = useState<"profit-and-loss" | "balance-sheet">("profit-and-loss");
  const [basis, setBasis] = useState<"accrual" | "cash">(() =>
    localStorage.getItem("cash-basis-fixture") === "cash" ? "cash" : "accrual",
  );
  const [drill, setDrill] = useState("");
  const input = cashInputFixture(),
    f = reportingFactsFixture();
  f.accounts = input.accounts;
  f.from = "2026-11-01";
  f.to = "2026-11-30";
  const settings = standardSettingsSchema.parse({ basis });
  const plan = standardPeriods(report, f.from, f.to, settings, 12, 31);
  // Only settlement journals exist in this fixture's November accrual period: no accrued P&L.
  f.period = [];
  f.standardColumns = plan.periods.map((period) => ({
    ...period,
    fyStart: f.fyStart,
    period: [],
    bsPrior: [],
    bsCurrent: report === "balance-sheet" ? f.bsCurrent : [],
  }));
  const facts = basis === "cash" ? cashStandardFacts(f, input, settings, report) : f;
  const doc = buildReportDocument(facts, {
    name: "Cash basis fixture",
    reportId: report,
    config: { settings: encodeStandardSettings(settings) },
  });
  return (
    <section aria-label="Cash basis fixture" className="space-y-4 rounded border p-4">
      <label>
        Statement
        <select
          aria-label="Fixture statement"
          value={report}
          onChange={(e) => setReport(e.target.value as typeof report)}
        >
          <option value="profit-and-loss">Profit and Loss</option>
          <option value="balance-sheet">Balance Sheet</option>
        </select>
      </label>
      <StatementBasisSelect
        basis={basis}
        report={report}
        onChange={(value) => {
          setBasis(value);
          localStorage.setItem("cash-basis-fixture", value);
        }}
      />
      <p role="status">{drill}</p>
      <DocumentPreview
        document={doc}
        onAccountDrill={(id, from, to) => setDrill(`Cash drill: ${id} ${from} to ${to}`)}
      />
    </section>
  );
}
function ForecastComparisonFixture() {
  const config = forecastSchema.parse({
    start: "2026-11-01",
    months: 2,
    baselineFrom: "2026-10-01",
    baselineTo: "2026-10-31",
    scenarios: [
      {
        id: "base",
        name: "Forecast test",
        revenueGrowthBps: 0,
        expenseGrowthBps: 0,
        assumptions: "Synthetic fixture: no growth",
      },
    ],
  });
  const output = forecastProjection(config, { revenueMinor: "10000", expenseMinor: "6000" }, [
    { month: "2026-11-01", revenueMinor: "12000", expenseMinor: "5000" },
  ])[0]!;
  return <ForecastComparison output={output} currency="GBP" />;
}
function CatalogueFixture() {
  const raw = useRouterState({ select: (state) => state.location.search });
  const search = parseReportingCentreSearch(raw as Record<string, unknown>);
  const navigate = useNavigate();
  return (
    <ReportCatalogue
      query={search.query ?? ""}
      category={search.category ?? "all"}
      from={search.from ?? "2026-04-01"}
      to={search.to ?? "2026-11-02"}
      onChange={({ query, category }) =>
        void navigate({
          to: "/reports",
          search: parseReportingCentreSearch({ ...search, query, category }),
          replace: true,
          resetScroll: false,
        })
      }
    />
  );
}
function ActivityFixture() {
  const [empty, setEmpty] = useState(false);
  const visits = [
    {
      key: "gl",
      reportId: "general-ledger",
      viewId: null,
      name: null,
      builder: false,
      from: "2026-10-01",
      to: "2026-10-31",
      openedAt: "2026-11-02T00:00:00Z",
      opens: 3,
      search: { account: "11111111-1111-4111-8111-111111111111", columns: "month" },
    },
    {
      key: "custom",
      reportId: "profit-and-loss",
      viewId: "22222222-2222-4222-8222-222222222222",
      name: "Board contribution",
      builder: true,
      from: "2026-09-01",
      to: "2026-09-30",
      openedAt: "2026-11-01T00:00:00Z",
      opens: 1,
    },
  ];
  return (
    <section aria-label="Report activity fixture" className="space-y-3 rounded border p-4">
      <button onClick={() => setEmpty(true)}>Clear fixture report activity</button>
      <ReportActivityList
        activity={{ recent: empty ? [] : visits, frequent: empty ? [] : [visits[0]!] }}
        fmt={{ date: (v) => v, dateTime: (v) => v }}
      />
    </section>
  );
}
const root = createRootRoute({ component: Fixture });
const reportRoute = createRoute({
  getParentRoute: () => root,
  path: "reports/$reportId",
  validateSearch: parseReportSearch,
});
const builderRoute = createRoute({
  getParentRoute: () => root,
  path: "reports/builder/$viewId",
  validateSearch: parseReportSearch,
});
const centreRoute = createRoute({
  getParentRoute: () => root,
  path: "reports",
  validateSearch: parseReportingCentreSearch,
});
const cashFixtureRoute = createRoute({ getParentRoute: () => root, path: "cash-fixture" });
const router = createRouter({
  routeTree: root.addChildren([reportRoute, builderRoute, centreRoute, cashFixtureRoute]),
});
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
