import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  listPlatformRecords,
  readSupportDiagnostics,
  getIntegrationReadiness,
  getPlatformDetails,
  exportPlatformRecords,
  getPlatformSubscriptionCohorts,
  getSupervisedSupport,
} from "@/lib/platform/platform.functions";
import { rowsCsv, recordFields, platformColumnLabel } from "@/lib/platform/catalog";
import type { PlatformContext, Row, Section } from "@/lib/platform/catalog";
import {
  PlatformCustomer360,
  PlatformRecordFields,
  PlatformRelatedRecords,
  MetadataTable,
} from "./PlatformCustomer360";
import { PlatformSupport } from "./PlatformSupport";
import { PlatformEditor } from "./PlatformEditor";
import { PlatformBulkActions } from "./PlatformBulkActions";
import type { EditMode } from "./PlatformEditor";

function display(value: unknown): string {
  if (value == null) return "—";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}
export function PlatformResource({
  section,
  context,
}: {
  section: Section;
  context: PlatformContext;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<"desc" | "asc">("desc");
  const [resource, setResource] = useState<string>(section);
  const [edit, setEdit] = useState<{ mode: EditMode; row: Row | null } | null>(null);
  const [details, setDetails] = useState<Row | null>(null);
  const [diagnosticCompany, setDiagnosticCompany] = useState("");
  const [diagnostics, setDiagnostics] = useState<Row[] | null>(null);
  const [diagnosticError, setDiagnosticError] = useState("");
  const [diagnosticBusy, setDiagnosticBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const loadDetails = useServerFn(getPlatformDetails);
  const related = useQuery({
    queryKey: ["platform", "details", section, details?.["id"]],
    queryFn: () =>
      loadDetails({
        data: {
          resource: section as "businesses" | "users" | "firms",
          id: String(details?.["id"]),
        },
      }),
    enabled: !!details && ["businesses", "users", "firms"].includes(section),
    retry: false,
  });
  const loadSupport = useServerFn(getSupervisedSupport);
  const support = useQuery({
    queryKey: ["platform", "supervised-support"],
    queryFn: () => loadSupport(),
    enabled:
      (section === "support" ||
        (section === "businesses" && context.permissions.includes("support.manage"))) &&
      context.permissions.includes("support.view"),
    retry: false,
  });
  const load = useServerFn(listPlatformRecords);
  const read = useServerFn(readSupportDiagnostics);
  async function loadDiagnostics(companyId: string) {
    setDiagnosticCompany(companyId);
    setDiagnosticBusy(true);
    setDiagnosticError("");
    setDiagnostics(null);
    try {
      setDiagnostics(await read({ data: { companyId } }));
    } catch (error) {
      setDiagnosticError(error instanceof Error ? error.message : "Diagnostic read failed");
      setDiagnostics(null);
    } finally {
      setDiagnosticBusy(false);
    }
  }
  const query = useQuery({
    queryKey: ["platform", resource, filter, page, sort],
    queryFn: () => load({ data: { resource, search: filter, page, sort } }),
    retry: false,
  });
  const readinessLoad = useServerFn(getIntegrationReadiness);
  const readiness = useQuery({
    queryKey: ["platform", "integration-readiness"],
    queryFn: () => readinessLoad(),
    enabled: section === "integrations",
    retry: false,
  });
  const loadCohorts = useServerFn(getPlatformSubscriptionCohorts);
  const cohorts = useQuery({
    queryKey: ["platform", "subscription-cohorts"],
    queryFn: () => loadCohorts(),
    enabled: section === "subscriptions",
    retry: false,
  });
  const canManage = context.permissions.includes(`${section}.manage`);
  const canCreate = canManage || context.permissions.includes(`${section}.create`);
  const canEdit = canManage || context.permissions.includes(`${section}.edit`);
  const canExport = canManage || context.permissions.includes(`${section}.export`);
  const exportRecords = useServerFn(exportPlatformRecords);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const owner = context.role === "platform_owner";
  const rows = query.data?.rows ?? [];
  const columns = rows.length
    ? Object.keys(rows[0]!).filter(
        (k) => !["document", "before_state", "after_state", "permissions"].includes(k),
      )
    : [];
  const editable =
    (canEdit && ["businesses", "firms", "users", ...Object.keys(recordFields)].includes(section)) ||
    (section === "roles" && owner && resource === "roles");
  async function exportPage() {
    setExporting(true);
    setExportError("");
    try {
      const result = await exportRecords({
        data: {
          resource: resource as Section | "assignments" | "grants",
          search: filter,
          page,
          sort,
        },
      });
      const url = URL.createObjectURL(
        new Blob([rowsCsv(result.rows)], { type: "text/csv;charset=utf-8;" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `linkbooks-${resource}-page-${page + 1}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }
  return (
    <div className="space-y-4">
      {section === "billing" ? (
        <div className="rounded-lg border bg-card p-4 text-sm">
          <p>
            Events are recorded by the configured payment gateway. They do not establish an
            outstanding balance.
          </p>
          {context.role === "platform_owner" || context.role === "platform_finance" ? (
            <Link
              to="/platform/billing"
              className="mt-2 inline-block font-medium text-primary underline"
            >
              Open plan pricing and publication
            </Link>
          ) : null}
        </div>
      ) : null}
      {section === "integrations" || section === "api" ? (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">
          This registry stores configuration notes and policies. Live connection checks, API
          credentials and enforcement require the corresponding service adapter. Credentials belong
          in server environment configuration.
        </p>
      ) : null}
      {section === "accounting" ? (
        <p className="text-sm text-muted-foreground">
          Templates are stored separately. Applying a template to an existing business requires its
          accounting settings workflow.
        </p>
      ) : null}
      {section === "integrations" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {readiness.data?.map((r) => (
            <div key={r.provider} className="rounded-lg border p-4 text-sm">
              <strong>{r.provider}</strong>
              <p>
                {r.configured ? "Server credentials configured" : "Server credentials unavailable"}
              </p>
              <p className="text-muted-foreground">{r.status}</p>
            </div>
          ))}
        </div>
      ) : null}
      {section === "businesses" && canEdit && selected.length > 0 ? (
        <PlatformBulkActions ids={selected} onComplete={() => setSelected([])} />
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(0);
            setFilter(search);
          }}
        >
          <Input
            aria-label="Search platform records"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            maxLength={160}
            placeholder="Search names, IDs or statuses…"
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <select
          aria-label="Sort records"
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={sort}
          onChange={(e) => {
            setSort(e.target.value as "asc" | "desc");
            setPage(0);
          }}
        >
          <option value="desc">Newest first</option>
          <option value="asc">Oldest first</option>
        </select>
        <Button variant="outline" onClick={() => void query.refetch()}>
          Refresh
        </Button>
        {rows.length > 0 && canExport ? (
          <Button variant="outline" onClick={exportPage} disabled={exporting}>
            Export this page
          </Button>
        ) : null}
        {(canCreate && ["businesses", "firms", ...Object.keys(recordFields)].includes(section)) ||
        (section === "roles" && owner && resource === "roles") ? (
          <Button onClick={() => setEdit({ mode: "create", row: null })}>
            Create {section === "businesses" ? "business" : section === "roles" ? "role" : "record"}
          </Button>
        ) : null}
        {(section === "businesses" && canManage) || (section === "firms" && canManage) ? (
          <Button variant="outline" onClick={() => setEdit({ mode: "member", row: null })}>
            Assign member
          </Button>
        ) : null}
        {section === "roles" && owner ? (
          <>
            <Button variant="outline" onClick={() => setEdit({ mode: "assign", row: null })}>
              Assign role
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setResource(resource === "roles" ? "assignments" : "roles");
                setPage(0);
                setFilter("");
                setSearch("");
              }}
            >
              {resource === "roles" ? "View assignments" : "View roles"}
            </Button>
          </>
        ) : null}
      </div>
      {exportError ? (
        <p role="alert" className="text-destructive">
          {exportError}
        </p>
      ) : null}
      {section === "subscriptions" ? (
        <section className="rounded-xl border bg-card p-5 text-sm">
          <h2 className="font-medium">Start months</h2>
          <p className="mt-1 text-muted-foreground">
            Counts use a stored start time. They are not revenue, lifetime value, or fees. The list
            column is the last update.
          </p>
          {cohorts.isPending ? (
            <p className="mt-2" role="status">
              Checking start months…
            </p>
          ) : cohorts.isError ? (
            <p className="mt-2" role="alert">
              {cohorts.error instanceof Error ? cohorts.error.message : "Start months failed."}
            </p>
          ) : cohorts.data?.message ? (
            <p className="mt-2" role="status">
              {cohorts.data.message}
            </p>
          ) : cohorts.data &&
            cohorts.data.unknownStart === 0 &&
            cohorts.data.months.length === 0 ? (
            <p className="mt-2" role="status">
              No subscriptions to group. This is not a zero revenue balance.
            </p>
          ) : (
            <>
              <p className="mt-2" role="status">
                {cohorts.data?.unknownStart
                  ? `${cohorts.data.unknownStart.toLocaleString()} subscriptions have no stored start and are not placed in a month.`
                  : "Every subscription in this count has a stored start."}
              </p>
              {cohorts.data?.months.length ? (
                <ul className="mt-2 space-y-1">
                  {cohorts.data.months.map((month) => (
                    <li key={month.month}>
                      {month.month}: {month.total.toLocaleString()} subscriptions.
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </section>
      ) : null}
      {query.isPending ? (
        <p role="status" className="p-8">
          Loading records…
        </p>
      ) : query.isError ? (
        <p role="alert" className="rounded-lg border border-destructive p-4 text-destructive">
          {query.error.message}
        </p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border bg-card p-12 text-center text-muted-foreground">
          No matching records.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{resource} records</caption>
            <thead className="border-b bg-muted/60">
              <tr>
                {section === "businesses" && canEdit ? (
                  <th scope="col" className="p-3">
                    Select
                  </th>
                ) : null}
                {columns.map((c) => (
                  <th key={c} scope="col" className="whitespace-nowrap p-3 font-medium">
                    {platformColumnLabel(section, c)}
                  </th>
                ))}
                <th scope="col" className="p-3">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={display(row["id"] ?? i)} className="border-b last:border-0">
                  {section === "businesses" && canEdit ? (
                    <td className="p-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${String(row["name"])}`}
                        checked={selected.includes(String(row["id"]))}
                        onChange={(e) =>
                          setSelected((v) =>
                            e.target.checked
                              ? [...v, String(row["id"])]
                              : v.filter((id) => id !== row["id"]),
                          )
                        }
                      />
                    </td>
                  ) : null}
                  {columns.map((c) => (
                    <td key={c} className="max-w-64 truncate p-3" title={display(row[c])}>
                      {display(row[c])}
                    </td>
                  ))}
                  <td className="flex gap-1 p-3">
                    <Button size="sm" variant="ghost" onClick={() => setDetails(row)}>
                      Details
                    </Button>
                    {editable && resource === section ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEdit({ mode: "edit", row })}
                      >
                        Edit
                      </Button>
                    ) : null}
                    {section === "users" && canManage && row["id"] !== context.userId ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEdit({ mode: "revoke", row })}
                      >
                        Revoke sessions
                      </Button>
                    ) : null}
                    {resource === "assignments" && owner ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEdit({ mode: "revokeRole", row })}
                      >
                        Revoke role
                      </Button>
                    ) : null}
                    {resource === "grants" && owner && !row["revoked_at"] ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEdit({ mode: "revokeGrant", row })}
                      >
                        Revoke grant
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {query.isError
            ? "Record count unavailable"
            : query.data
              ? `${query.data.total} records · Page ${page + 1}`
              : "Loading record count…"}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={page === 0 || query.isFetching}
            onClick={() => setPage((v) => v - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            disabled={query.isFetching || (page + 1) * 25 >= (query.data?.total ?? 0)}
            onClick={() => setPage((v) => v + 1)}
          >
            Next
          </Button>
        </div>
      </div>
      {section === "support" ? (
        <PlatformSupport
          context={context}
          onRead={(companyId) => void loadDiagnostics(companyId)}
          reading={diagnosticBusy}
        />
      ) : null}
      {section === "support" && support.data?.ready === true ? (
        <section className="rounded-xl border p-5">
          <h2 className="font-semibold">Audited journal diagnostics</h2>
          <p className="my-2 text-sm text-muted-foreground">
            Requires a separate approved, unexpired grant for your user and this business. Returns
            up to 25 journal headers; each read is audited.
          </p>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void loadDiagnostics(diagnosticCompany);
            }}
          >
            <Input
              aria-label="Diagnostic business ID"
              className="max-w-md"
              required
              value={diagnosticCompany}
              disabled={diagnosticBusy}
              onChange={(e) => {
                setDiagnosticCompany(e.target.value);
                setDiagnostics(null);
                setDiagnosticError("");
              }}
            />
            <Button disabled={diagnosticBusy}>
              {diagnosticBusy ? "Loading…" : "Read diagnostics"}
            </Button>
          </form>
          {diagnosticError ? (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {diagnosticError}
            </p>
          ) : null}
          {diagnostics ? (
            <MetadataTable rows={diagnostics} empty="No journal headers found for this business." />
          ) : null}
        </section>
      ) : null}
      {edit ? (
        <PlatformEditor
          section={section}
          mode={edit.mode}
          row={edit.row}
          onClose={() => setEdit(null)}
        />
      ) : null}
      {details ? (
        <Dialog open onOpenChange={() => setDetails(null)}>
          <DialogContent className="max-h-[85vh] overflow-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {section === "businesses"
                  ? `Customer 360 · ${display(details["name"])}`
                  : "Record details"}
              </DialogTitle>
              <DialogDescription>Stored record · {display(details["id"])}</DialogDescription>
            </DialogHeader>
            {section !== "businesses" ? <PlatformRecordFields row={details} /> : null}
            {related.isFetching ? (
              <p role="status">Loading related records…</p>
            ) : related.isError ? (
              <div role="alert">
                <p>{related.error.message}</p>
                <Button variant="outline" onClick={() => void related.refetch()}>
                  Retry details
                </Button>
              </div>
            ) : related.data ? (
              section === "businesses" ? (
                <PlatformCustomer360
                  business={details}
                  related={related.data}
                  canRequestSupport={
                    support.data?.ready === true && context.permissions.includes("support.manage")
                  }
                />
              ) : (
                <PlatformRelatedRecords related={related.data} />
              )
            ) : null}
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
