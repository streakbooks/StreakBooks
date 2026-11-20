import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { ReportAccessDialog } from "./ReportAccessDialog";
import { ReportDeliveryDialog } from "./ReportDeliveryDialog";
import { exportReportDocument } from "@/lib/reports/ecosystem.functions";
import { downloadReportFile } from "@/lib/reports/download";
import { fiscalYearStart, todayIso } from "@/lib/accounting/fiscal-year";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Star, MoreHorizontal, Plus, LockKeyhole, FileText } from "lucide-react";
import { toast } from "sonner";
import { REPORT_CATALOG, getReportById } from "@/lib/reports/catalog";
import { parseReportSearch } from "@/lib/reports/search";
import { useReportingCentreOrigin } from "@/hooks/use-reporting-centre-origin";
import { libraryMetadata, type SavedReport } from "@/lib/reports/saved-report";
import {
  listReportLibrary,
  saveReportView,
  updateSavedReportView,
  duplicateSavedReportView,
  deleteSavedReportView,
} from "@/lib/reports/report-views.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { useFormat } from "@/hooks/use-format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { EmptyState, LoadingState } from "@/components/common/states";
import { PagerBar } from "./ReportShell";

const runnable = REPORT_CATALOG.filter(
  (r) => r.status === "ready" && r.runner !== "link" && r.runner !== "none",
);
const selectClass = "h-9 rounded-md border border-input bg-background px-3 text-sm";

export function ReportLibrary({
  companyId,
  initialState = "active",
}: {
  companyId: string;
  initialState?: "active" | "archived" | "templates";
}) {
  const fmt = useFormat();
  const centre = useReportingCentreOrigin();
  const { company } = useActiveCompany();
  const canExport = useCanDo("reports.export");
  const exportFn = useServerFn(exportReportDocument);
  const [sharing, setSharing] = useState<SavedReport | null>(null);
  const [delivering, setDelivering] = useState<SavedReport | null>(null);
  const periodFrom = company
    ? fiscalYearStart(todayIso(), company.fiscal_year_end_month, company.fiscal_year_end_day ?? 31)
    : todayIso();
  const exporting = useMutation({
    mutationFn: ({ row, format }: { row: SavedReport; format: "pdf" | "xlsx" | "csv" }) =>
      exportFn({
        data: {
          companyId,
          viewId: row.id,
          from: String(row.config["from"] ?? periodFrom),
          to: String(row.config["to"] ?? todayIso()),
          format,
        },
      }),
    onSuccess: downloadReportFile,
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  const client = useQueryClient();
  const list = useServerFn(listReportLibrary);
  const create = useServerFn(saveReportView);
  const update = useServerFn(updateSavedReportView);
  const duplicate = useServerFn(duplicateSavedReportView);
  const remove = useServerFn(deleteSavedReportView);
  const [query, setQuery] = useState("");
  const [reportId, setReportId] = useState("");
  const [favourite, setFavourite] = useState(false);
  const [state, setState] = useState<"active" | "archived" | "templates">(initialState);
  const [sort, setSort] = useState<"name" | "updated_at">("updated_at");
  const [page, setPage] = useState(0);
  const [editor, setEditor] = useState<SavedReport | "new" | null>(null);
  const [deleting, setDeleting] = useState<SavedReport | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [base, setBase] = useState("profit-and-loss");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [columns, setColumns] = useState("none");
  const [compare, setCompare] = useState("none");
  const key = ["report-library", companyId, query, reportId, favourite, sort, page, state];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const result = await list({
        data: { companyId, query, reportId, favourite, sort, page, state },
      });
      return {
        ...result,
        rows: result.rows.map(({ config_json, ...row }) => ({
          ...row,
          config: JSON.parse(config_json) as Record<string, unknown>,
        })),
      };
    },
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: (run: () => Promise<unknown>) => run(),
    onSuccess: async () => {
      setEditor(null);
      setDeleting(null);
      await Promise.all([
        client.invalidateQueries({ queryKey: ["report-library", companyId] }),
        client.invalidateQueries({ queryKey: ["report-saved-views", companyId] }),
      ]);
      toast.success("Report library updated");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  function edit(row?: SavedReport) {
    setEditor(row ?? "new");
    setName(row?.name ?? "");
    setBase(row?.report_id ?? "profit-and-loss");
    setDescription(row ? libraryMetadata(row.config).description : "");
    setFrom(String(row?.config["from"] ?? ""));
    setTo(String(row?.config["to"] ?? ""));
    setColumns(String(row?.config["columns"] ?? "none"));
    setCompare(String(row?.config["compare"] ?? "none"));
  }
  function patch(row: SavedReport, config = row.config, isFavourite = row.is_favourite) {
    mutation.mutate(() =>
      update({
        data: {
          companyId,
          viewId: row.id,
          updatedAt: row.updated_at,
          name: row.name,
          config,
          isFavourite,
        },
      }),
    );
  }
  function save() {
    const config = {
      ...(editor && editor !== "new" ? editor.config : {}),
      ...parseReportSearch({ from, to, columns, compare }),
    };
    if (!from) delete config["from"];
    if (!to) delete config["to"];
    if (columns === "none") delete config["columns"];
    if (compare === "none") delete config["compare"];
    if (editor === "new") {
      mutation.mutate(() =>
        create({
          data: {
            companyId,
            reportId: base,
            name,
            config: { ...config, _library: { description } },
          },
        }),
      );
    } else if (editor) {
      mutation.mutate(() =>
        update({
          data: {
            companyId,
            viewId: editor.id,
            updatedAt: editor.updated_at,
            name,
            config: { ...config, _library: { ...libraryMetadata(editor.config), description } },
            isFavourite: editor.is_favourite,
          },
        }),
      );
    }
  }
  return (
    <section className="space-y-4" aria-label="Custom report library">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Your custom reports</h2>
          <p className="text-sm text-muted-foreground">
            Saved configurations run against the current posted ledger. Each report is private to
            you.
          </p>
        </div>
        <Button onClick={() => edit()}>
          <Plus className="mr-2 size-4" />
          Create report
        </Button>
      </div>
      <Button asChild variant="outline">
        <Link to="/reports/builder/$viewId" params={{ viewId: "new" }}>
          Advanced report builder
        </Link>
      </Button>
      <div className="flex flex-wrap gap-2">
        <Input
          className="sm:max-w-xs"
          aria-label="Search custom reports"
          placeholder="Search saved reports…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
        <RecordLookupSelect
          className={selectClass}
          aria-label="Report type"
          value={reportId}
          onValueChange={(e) => {
            setReportId(e);
            setPage(0);
          }}
        >
          <option value="">All report types</option>
          {runnable.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}
            </option>
          ))}
        </RecordLookupSelect>
        <select
          className={selectClass}
          aria-label="Library status"
          value={state}
          onChange={(e) => {
            setState(e.target.value as typeof state);
            setPage(0);
          }}
        >
          <option value="active">Active reports</option>
          <option value="templates">Templates</option>
          <option value="archived">Archived reports</option>
        </select>
        <select
          className={selectClass}
          aria-label="Sort reports"
          value={sort}
          onChange={(e) => {
            setSort(e.target.value as typeof sort);
            setPage(0);
          }}
        >
          <option value="updated_at">Recently updated</option>
          <option value="name">Name A–Z</option>
        </select>
        <Button
          variant={favourite ? "secondary" : "outline"}
          aria-pressed={favourite}
          onClick={() => {
            setFavourite(!favourite);
            setPage(0);
          }}
        >
          <Star className="mr-2 size-4" />
          Favourites
        </Button>
      </div>
      {q.isPending ? (
        <LoadingState />
      ) : q.isError ? (
        <QueryErrorState queries={[q]} title="Could not load custom reports" />
      ) : !q.isSuccess ? (
        <LoadingState />
      ) : (
        <>
          {!q.data.rows.length ? (
            <EmptyState
              title="No saved reports found"
              description="Create a report, save a view from any financial report, or change your filters."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="p-3">Favourite</th>
                    <th className="p-3">Report</th>
                    <th className="p-3">Reporting period</th>
                    <th className="p-3">Updated</th>
                    <th className="p-3">Access</th>
                    <th className="p-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.rows.map((row) => {
                    const meta = libraryMetadata(row.config);
                    return (
                      <tr key={row.id} className="border-t hover:bg-muted/20">
                        <td className="p-3">
                          <Button
                            size="icon"
                            variant="ghost"
                            disabled={mutation.isPending || row.user_id !== q.data.userId}
                            aria-label={`${row.is_favourite ? "Unfavourite" : "Favourite"} ${row.name}`}
                            onClick={() => patch(row, row.config, !row.is_favourite)}
                          >
                            <Star
                              className={`size-4 ${row.is_favourite ? "fill-primary text-primary" : "text-muted-foreground"}`}
                            />
                          </Button>
                        </td>
                        <td className="min-w-64 p-3">
                          {row.config["_builder"] ? (
                            <Link
                              className="font-medium hover:underline"
                              to="/reports/builder/$viewId"
                              params={{ viewId: row.id }}
                            >
                              {row.name}
                            </Link>
                          ) : (
                            <Link
                              className="font-medium hover:underline"
                              to="/reports/$reportId"
                              params={{ reportId: row.report_id }}
                              search={{ ...parseReportSearch(row.config), centre }}
                            >
                              {row.name}
                            </Link>
                          )}
                          <p className="text-xs text-muted-foreground">Owner: {row.ownerName}</p>
                          <p className="text-xs text-muted-foreground">
                            {getReportById(row.report_id)?.title ?? row.report_id}
                          </p>
                          {meta.template && <Badge variant="secondary">Template</Badge>}
                          {meta.description && (
                            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                              {meta.description}
                            </p>
                          )}
                        </td>
                        <td className="whitespace-nowrap p-3">
                          {row.config["from"] || row.config["to"]
                            ? `${row.config["from"] ? fmt.date(String(row.config["from"])) : "Current FY start"} – ${row.config["to"] ? fmt.date(String(row.config["to"])) : "Today"}`
                            : "Current financial year"}
                        </td>
                        <td className="whitespace-nowrap p-3">
                          {fmt.dateTime(row.updated_at)}
                          <p className="text-xs text-muted-foreground">
                            Created {fmt.date(row.created_at)} · Modified by {row.modifierName}
                          </p>
                        </td>
                        <td className="p-3">
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <LockKeyhole className="size-3" />
                            {row.access_level ?? "private"}
                          </span>
                        </td>
                        <td className="p-3">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Actions for ${row.name}`}
                                disabled={mutation.isPending}
                              >
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                disabled={row.user_id !== q.data.userId}
                                onSelect={() => edit(row)}
                              >
                                Rename / edit dates
                              </DropdownMenuItem>
                              {!!row.config["_builder"] && (
                                <DropdownMenuItem asChild>
                                  <Link to="/reports/builder/$viewId" params={{ viewId: row.id }}>
                                    Open report builder
                                  </Link>
                                </DropdownMenuItem>
                              )}
                              {canExport && row.user_id === q.data.userId && (
                                <DropdownMenuItem onSelect={() => setSharing(row)}>
                                  Share / revoke access
                                </DropdownMenuItem>
                              )}
                              {canExport &&
                                (row.config["_builder"] ||
                                  [
                                    "profit-and-loss",
                                    "balance-sheet",
                                    "trial-balance",
                                    "cash-summary",
                                    "cash-flow-indirect",
                                  ].includes(row.report_id)) && (
                                  <>
                                    {(["pdf", "xlsx", "csv"] as const).map((format) => (
                                      <DropdownMenuItem
                                        key={format}
                                        disabled={exporting.isPending}
                                        onSelect={() => exporting.mutate({ row, format })}
                                      >
                                        Export {format.toUpperCase()}
                                      </DropdownMenuItem>
                                    ))}
                                    {row.user_id === q.data.userId && (
                                      <DropdownMenuItem onSelect={() => setDelivering(row)}>
                                        Email / schedule
                                      </DropdownMenuItem>
                                    )}
                                  </>
                                )}
                              <DropdownMenuItem
                                disabled={row.user_id !== q.data.userId}
                                onSelect={() =>
                                  mutation.mutate(() =>
                                    duplicate({ data: { companyId, viewId: row.id } }),
                                  )
                                }
                              >
                                {meta.template ? "Use template" : "Duplicate"}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={row.user_id !== q.data.userId}
                                onSelect={() =>
                                  patch(row, {
                                    ...row.config,
                                    _library: { ...meta, template: !meta.template },
                                  })
                                }
                              >
                                {meta.template ? "Remove template status" : "Save as template"}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={row.user_id !== q.data.userId}
                                onSelect={() =>
                                  patch(row, {
                                    ...row.config,
                                    _library: { ...meta, archived: !meta.archived },
                                  })
                                }
                              >
                                {meta.archived ? "Restore report" : "Archive report"}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                disabled={row.user_id !== q.data.userId}
                                onSelect={() => setDeleting(row)}
                              >
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <PagerBar page={page} pageSize={20} total={q.data.total} onPage={setPage} />
        </>
      )}
      <Dialog
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setEditor(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editor === "new" ? "Create a custom report" : "Edit report configuration"}
            </DialogTitle>
            <DialogDescription>
              Use an existing report and its ledger filters. Leave dates blank to use the current
              financial year when opened.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="custom-name">Report name</Label>
              <Input
                id="custom-name"
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="custom-base">Base report</Label>
              <RecordLookupSelect
                id="custom-base"
                className={`${selectClass} w-full`}
                disabled={editor !== "new"}
                value={base}
                onValueChange={(e) => {
                  setBase(e);
                  setColumns("none");
                  setCompare("none");
                }}
              >
                {runnable.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </RecordLookupSelect>
            </div>
            <div className="space-y-1">
              <Label htmlFor="custom-description">Description</Label>
              <Input
                id="custom-description"
                maxLength={1000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="custom-from">From (optional)</Label>
                <Input
                  id="custom-from"
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="custom-to">To / as at (optional)</Label>
                <Input
                  id="custom-to"
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
            </div>
            {base === "profit-and-loss" && (
              <div className="space-y-1">
                <Label htmlFor="custom-columns">Columns</Label>
                <select
                  id="custom-columns"
                  className={`${selectClass} w-full`}
                  value={columns}
                  onChange={(e) => setColumns(e.target.value)}
                >
                  <option value="none">Selected period</option>
                  <option value="prior_period">Prior period comparison</option>
                  <option value="prior_year">Prior year comparison</option>
                  <option value="month">Monthly</option>
                  <option value="quarter">Quarterly</option>
                </select>
              </div>
            )}
            {base === "balance-sheet" && (
              <div className="space-y-1">
                <Label htmlFor="custom-compare">Compare</Label>
                <select
                  id="custom-compare"
                  className={`${selectClass} w-full`}
                  value={compare}
                  onChange={(e) => setCompare(e.target.value)}
                >
                  <option value="none">No comparison</option>
                  <option value="prior_month">Prior month end</option>
                  <option value="prior_year">Prior year</option>
                  <option value="months">Last six month ends</option>
                </select>
              </div>
            )}
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <FileText className="size-4" />
              Open the report after saving to preview, adjust account filters, and export.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={mutation.isPending} onClick={() => setEditor(null)}>
              Cancel
            </Button>
            <Button
              disabled={!name.trim() || mutation.isPending || !!(from && to && from > to)}
              onClick={save}
            >
              Save report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setDeleting(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{deleting?.name}”?</DialogTitle>
            <DialogDescription>
              This permanently deletes this saved configuration. Accounting transactions are
              unaffected. Archive it instead if you may need it later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={mutation.isPending}
              onClick={() =>
                deleting &&
                mutation.mutate(() => remove({ data: { companyId, viewId: deleting.id } }))
              }
            >
              Delete report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {sharing && (
        <ReportAccessDialog
          companyId={companyId}
          report={sharing}
          onClose={() => setSharing(null)}
        />
      )}
      {delivering && (
        <ReportDeliveryDialog
          companyId={companyId}
          target={{ viewId: delivering.id }}
          name={delivering.name}
          from={String(delivering.config["from"] ?? periodFrom)}
          to={String(delivering.config["to"] ?? todayIso())}
          onClose={() => setDelivering(null)}
        />
      )}
    </section>
  );
}
