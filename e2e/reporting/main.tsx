// Browser harness for real designer/renderer/lookup components. API persistence and RLS use the separate live SQL suite.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
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
        definition={definition}
        onChange={(d) => {
          setDefinition(d);
          setDocument(null);
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
          disabled={!document}
          onClick={() => {
            localStorage.setItem("reporting-designer", JSON.stringify(definition));
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
const root = createRootRoute({ component: Fixture });
const router = createRouter({ routeTree: root });
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
