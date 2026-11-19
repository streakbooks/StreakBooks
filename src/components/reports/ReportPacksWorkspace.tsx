import { getReportingBasis } from "@/lib/reports/accounting-basis.functions";
import { StatementBasisSelect } from "./StatementBasisSelect";
import { Link } from "@tanstack/react-router";
import { ReportingModelSelect } from "./ReportingModelSelect";
import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getReportingWorkspace,
  saveReportPack,
  transitionReportPack,
  getReportPack,
  addReportComment,
  saveReportingModel,
  exportReportDocument,
  deleteReportSchedule,
} from "@/lib/reports/ecosystem.functions";
import {
  PACK_REPORTS,
  buildReportDocument,
  type ReportDocument,
} from "@/lib/reports/report-document";
import {
  packConfigSchema,
  type ReportingPack,
  type ReportingMember,
  type PackConfig,
} from "@/lib/reports/ecosystem-model";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { useCanDo } from "@/hooks/use-can";
import { DocumentPreview } from "./DocumentPreview";
import { downloadReportFile } from "@/lib/reports/download";
import { ReportDeliveryDialog } from "./ReportDeliveryDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { LoadingState, EmptyState } from "@/components/common/states";
type Workspace = {
  packs: ReportingPack[];
  schedules: Array<Record<string, unknown>>;
  deliveries: Array<Record<string, unknown>>;
  members: ReportingMember[];
  userId: string;
  hasMore: boolean;
  packTotal: number;
  scheduleTotal: number;
  deliveryTotal: number;
};
const titles: Record<string, string> = {
  "profit-and-loss": "Profit and Loss",
  "balance-sheet": "Balance Sheet",
  "trial-balance": "Trial Balance",
  "cash-summary": "Cash Summary",
  "cash-flow-indirect": "Cash Flow (indirect)",
};
export function ReportPacksWorkspace({
  companyId,
  from,
  to,
  filter = "all",
  selectedPackId = null,
  onSelectPack,
}: {
  companyId: string;
  from: string;
  to: string;
  filter?: "all" | "drafts" | "published" | "archived";
  selectedPackId?: string | null;
  onSelectPack?: (id: string | null) => void;
}) {
  const client = useQueryClient(),
    fetch = useServerFn(getReportingWorkspace),
    save = useServerFn(saveReportPack),
    transition = useServerFn(transitionReportPack),
    load = useServerFn(getReportPack),
    commentFn = useServerFn(addReportComment),
    templateFn = useServerFn(saveReportingModel),
    exportFn = useServerFn(exportReportDocument),
    deleteSchedule = useServerFn(deleteReportSchedule),
    loadBasis = useServerFn(getReportingBasis);
  const companyBasis = useQuery({
    queryKey: ["reporting-basis", companyId],
    queryFn: () => loadBasis({ data: { companyId } }),
  });
  const canPrepare = useCanDo("accounting.post"),
    canExport = useCanDo("reports.export");
  const [schedulePage, setSchedulePage] = useState(0);
  const [deliveryPage, setDeliveryPage] = useState(0);
  const [page, setPage] = useState(0),
    [search, setSearch] = useState("");
  const q = useQuery({
    queryKey: ["reporting-workspace", companyId, filter, page, search, schedulePage, deliveryPage],
    queryFn: async () =>
      JSON.parse(
        await fetch({
          data: {
            companyId,
            packPage: page,
            packState: filter,
            packQuery: search,
            schedulePage,
            deliveryPage,
          },
        }),
      ) as Workspace,
    retry: false,
  });
  const [editor, setEditor] = useState<ReportingPack | "new" | null>(null),
    [name, setName] = useState("Monthly management pack"),
    [start, setStart] = useState(from),
    [end, setEnd] = useState(to),
    [config, setConfig] = useState<PackConfig>(() =>
      packConfigSchema.parse({ reports: ["profit-and-loss", "balance-sheet", "cash-summary"] }),
    ),
    [reviewer, setReviewer] = useState(""),
    [preparer, setPreparer] = useState("");
  const previewId = selectedPackId;
  const setPreviewId = onSelectPack ?? (() => {});
  const [note, setNote] = useState(""),
    [delivery, setDelivery] = useState<ReportingPack | null>(null),
    [editingSchedule, setEditingSchedule] = useState<Record<string, unknown> | null>(null);
  const selected = useQuery({
    queryKey: ["report-pack", companyId, previewId],
    enabled: !!previewId,
    queryFn: async () =>
      JSON.parse(await load({ data: { companyId, id: previewId! } })) as {
        pack: ReportingPack;
        comments: Array<{ id: string; author_id: string; body: string; created_at: string }>;
      },
    retry: false,
  });
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["reporting-workspace", companyId] }),
      client.invalidateQueries({ queryKey: ["report-pack", companyId] }),
    ]);
  };
  const mutation = useMutation({
    mutationFn: (run: () => Promise<unknown>) => run(),
    onSuccess: async () => {
      setEditor(null);
      setNote("");
      await refresh();
      toast.success("Reporting workspace updated");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  const exporting = useMutation({
    mutationFn: ({ id, format }: { id: string; format: "pdf" | "xlsx" | "csv" }) =>
      exportFn({ data: { companyId, packId: id, format } }),
    onSuccess: downloadReportFile,
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  function edit(pack?: ReportingPack) {
    setEditor(pack ?? "new");
    setName(pack?.name ?? "Monthly management pack");
    setStart(pack?.from_date ?? from);
    setEnd(pack?.to_date ?? to);
    setConfig(
      pack?.config ??
        packConfigSchema.parse({
          basis: companyBasis.data ?? "accrual",
          reports: ["profit-and-loss", "balance-sheet", "cash-summary"],
        }),
    );
    setReviewer(pack?.reviewer_id ?? "");
    setPreparer(pack?.preparer_id ?? "");
  }
  const action = (
    pack: ReportingPack,
    act: "start" | "submit" | "approve" | "request_changes" | "publish" | "archive" | "restore",
  ) =>
    mutation.mutate(() =>
      transition({ data: { companyId, id: pack.id, version: pack.version, action: act, note } }),
    );
  if (q.isPending || companyBasis.isPending) return <LoadingState />;
  if (q.isError || companyBasis.isError)
    return (
      <QueryErrorState queries={[q, companyBasis]} title="Could not load reporting workspace" />
    );
  const workspace = q.data;
  const packs = workspace.packs;
  let document: ReportDocument | null = null,
    documentError = "";
  if (selected.data?.pack.snapshot)
    try {
      document = buildReportDocument(selected.data.pack.snapshot, {
        name: selected.data.pack.name,
        config: selected.data.pack.config,
      });
    } catch (e) {
      documentError = friendlyAuthError(e);
    }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">
            {filter === "drafts"
              ? "Drafts & review"
              : filter === "published"
                ? "Published reports"
                : filter === "archived"
                  ? "Archived report packs"
                  : "Management report packs"}
          </h2>
          <p className="text-sm text-muted-foreground">
            Prepare, independently review and publish financial snapshots that retain their approved
            values.
          </p>
        </div>
        {canPrepare && <Button onClick={() => edit()}>Create report pack</Button>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Input
          aria-label="Search report packs"
          className="max-w-sm"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          placeholder="Find a report pack"
        />
        <Button variant="outline" onClick={() => void refresh()}>
          Refresh workspace
        </Button>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <Button variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
          Previous
        </Button>
        <span>
          {workspace.packTotal} packs · Page {page + 1}
        </span>
        <Button variant="outline" disabled={!workspace.hasMore} onClick={() => setPage(page + 1)}>
          Next
        </Button>
      </div>
      {!packs.length ? (
        <EmptyState
          title="No report packs in this view"
          description="Create a pack or choose another lifecycle view."
        />
      ) : (
        <div className="overflow-x-auto rounded border">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="p-3">Pack</th>
                <th className="p-3">Period</th>
                <th className="p-3">Status</th>
                <th className="p-3">Preparation / review</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {packs.map((p) => {
                const owns = p.owner_id === workspace.userId || p.preparer_id === workspace.userId;
                return (
                  <tr key={p.id} className="border-t">
                    <td className="p-3">
                      <Link
                        to="/reports"
                        search={(prev) =>
                          ({
                            ...prev,
                            tab:
                              prev.tab === "drafts" ||
                              prev.tab === "published" ||
                              prev.tab === "archived"
                                ? prev.tab
                                : "packs",
                            pack: p.id,
                          }) as never
                        }
                        className="font-medium underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                      >
                        {p.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">Revision {p.version}</p>
                    </td>
                    <td className="whitespace-nowrap p-3">
                      {p.from_date} – {p.to_date}
                    </td>
                    <td className="p-3">
                      <Badge variant="secondary">{p.status.replaceAll("_", " ")}</Badge>
                    </td>
                    <td className="p-3">
                      <p>
                        {workspace.members.find((m) => m.user_id === p.preparer_id)?.name ??
                          "Owner prepares"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Reviewer:{" "}
                        {workspace.members.find((m) => m.user_id === p.reviewer_id)?.name ??
                          "Unassigned"}
                      </p>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        <Button size="sm" variant="ghost" asChild>
                          <Link to="/reports" search={(prev) => ({ ...prev, pack: p.id }) as never}>
                            Open
                          </Link>
                        </Button>
                        {canPrepare &&
                          owns &&
                          ["draft", "in_progress", "review_required"].includes(p.status) && (
                            <Button size="sm" variant="outline" onClick={() => edit(p)}>
                              Edit
                            </Button>
                          )}
                        {canPrepare && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              edit();
                              setConfig({ ...p.config, commentary: "", actionItems: [] });
                              setName(`${p.name.slice(0, 150)} (copy)`);
                            }}
                          >
                            Duplicate
                          </Button>
                        )}
                        {canExport &&
                          p.snapshot_hash &&
                          ["pdf", "xlsx", "csv"].map((format) => (
                            <Button
                              key={format}
                              size="sm"
                              variant="ghost"
                              disabled={exporting.isPending}
                              onClick={() =>
                                exporting.mutate({
                                  id: p.id,
                                  format: format as "pdf" | "xlsx" | "csv",
                                })
                              }
                            >
                              {format.toUpperCase()}
                            </Button>
                          ))}
                        {canExport &&
                          p.owner_id === workspace.userId &&
                          ["published", "delivered"].includes(p.status) && (
                            <Button size="sm" variant="outline" onClick={() => setDelivery(p)}>
                              Deliver / schedule
                            </Button>
                          )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {previewId && (
        <section className="space-y-4 rounded-lg border p-4">
          <div className="flex justify-between">
            <h3 className="font-semibold">Report pack workspace</h3>
            <Button variant="ghost" onClick={() => setPreviewId(null)}>
              Close pack
            </Button>
          </div>
          {selected.isPending ? (
            <LoadingState />
          ) : selected.isError ? (
            <QueryErrorState queries={[selected]} title="Could not open pack" />
          ) : (
            selected.data && (
              <>
                <p className="text-sm">
                  Snapshot fingerprint:{" "}
                  <span className="break-all font-mono text-xs">
                    {selected.data.pack.snapshot_hash ??
                      "Not captured — submit for review to freeze financial values"}
                  </span>
                </p>
                {documentError && (
                  <p role="alert" className="text-destructive">
                    {documentError}
                  </p>
                )}
                {document && <DocumentPreview document={document} />}
                <div className="space-y-3">
                  <h4 className="font-semibold">Review comments & evidence</h4>
                  {selected.data.comments.map((c) => (
                    <div key={c.id} className="rounded border p-3 text-sm">
                      <p className="whitespace-pre-wrap">{c.body}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {workspace.members.find((m) => m.user_id === c.author_id)?.name ??
                          c.author_id}{" "}
                        · {c.created_at}
                      </p>
                    </div>
                  ))}
                  <Label htmlFor="pack-review-note">Comment / transition evidence</Label>
                  <Textarea
                    id="pack-review-note"
                    maxLength={4000}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    disabled={!note.trim() || mutation.isPending}
                    onClick={() =>
                      mutation.mutate(() =>
                        commentFn({ data: { companyId, packId: previewId, body: note } }),
                      )
                    }
                  >
                    Add comment
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canPrepare &&
                    (() => {
                      const p = selected.data.pack,
                        own = p.owner_id === workspace.userId || p.preparer_id === workspace.userId;
                      return (
                        <>
                          {own && p.status === "draft" && (
                            <Button
                              disabled={mutation.isPending}
                              onClick={() => action(p, "start")}
                            >
                              Start preparation
                            </Button>
                          )}
                          {own &&
                            ["draft", "in_progress", "review_required"].includes(p.status) && (
                              <Button
                                disabled={
                                  mutation.isPending ||
                                  !p.reviewer_id ||
                                  p.reviewer_id === workspace.userId
                                }
                                onClick={() => action(p, "submit")}
                              >
                                Capture & submit for review
                              </Button>
                            )}
                          {p.status === "ready_for_review" &&
                            p.reviewer_id === workspace.userId &&
                            p.prepared_by !== workspace.userId && (
                              <>
                                <Button
                                  disabled={mutation.isPending}
                                  onClick={() => action(p, "approve")}
                                >
                                  Approve snapshot
                                </Button>
                                <Button
                                  variant="outline"
                                  disabled={mutation.isPending || !note.trim()}
                                  onClick={() => action(p, "request_changes")}
                                >
                                  Request changes
                                </Button>
                              </>
                            )}
                          {own && p.status === "approved" && (
                            <Button
                              disabled={mutation.isPending}
                              onClick={() => action(p, "publish")}
                            >
                              Publish approved pack
                            </Button>
                          )}
                          {own && p.status !== "archived" && (
                            <Button
                              variant="outline"
                              disabled={mutation.isPending}
                              onClick={() => action(p, "archive")}
                            >
                              Archive pack
                            </Button>
                          )}
                          {own && p.status === "archived" && (
                            <Button
                              variant="outline"
                              disabled={mutation.isPending}
                              onClick={() => action(p, "restore")}
                            >
                              Restore pack
                            </Button>
                          )}
                        </>
                      );
                    })()}
                </div>
              </>
            )
          )}
        </section>
      )}
      <section className="space-y-3">
        <h3 className="font-semibold">Schedules & delivery history</h3>
        {!workspace.schedules.length && !workspace.deliveries.length ? (
          <p className="text-sm text-muted-foreground">
            No report schedules or delivery attempts yet.
          </p>
        ) : (
          <>
            <div className="space-y-2">
              {workspace.schedules.map((s) => (
                <div
                  key={String(s["id"])}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border p-3 text-sm"
                >
                  <div>
                    <p>
                      {String(s["subject"])} · {String(s["recurrence"])}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s["enabled"] ? "Enabled" : "Paused"} · next {String(s["next_run_at"])} ·{" "}
                      {String(s["timezone"])}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditingSchedule(s)}>
                      Edit schedule
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={mutation.isPending}
                      onClick={() => {
                        if (window.confirm("Permanently delete this report schedule?"))
                          mutation.mutate(() =>
                            deleteSchedule({ data: { companyId, id: String(s["id"]) } }),
                          );
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th className="p-2">Subject</th>
                    <th className="p-2">Status</th>
                    <th className="p-2">Attempts</th>
                    <th className="p-2">Provider / error</th>
                  </tr>
                </thead>
                <tbody>
                  {workspace.deliveries.map((d) => (
                    <tr key={String(d["id"])} className="border-t">
                      <td className="p-2">{String(d["subject"])}</td>
                      <td className="p-2">{String(d["status"])}</td>
                      <td className="p-2">{String(d["attempts"])}</td>
                      <td className="p-2">
                        {String(d["last_error"] ?? d["provider_id"] ?? "Awaiting worker")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <HistoryPageControls
            label="Schedules"
            page={schedulePage}
            total={workspace.scheduleTotal}
            onPage={setSchedulePage}
          />
          <HistoryPageControls
            label="Delivery history"
            page={deliveryPage}
            total={workspace.deliveryTotal}
            onPage={setDeliveryPage}
          />
        </div>
      </section>
      <Dialog
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setEditor(null);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editor === "new" ? "Create management report pack" : "Edit report pack"}
            </DialogTitle>
            <DialogDescription>
              Choose reports in their delivery order and accounting method. Submission captures the
              selected figures; publication requires a different assigned reviewer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <StatementBasisSelect
              basis={config.basis}
              report="profit-and-loss"
              onChange={(basis) => setConfig({ ...config, basis })}
            />
            <Label htmlFor="pack-name">Pack name</Label>
            <Input
              id="pack-name"
              maxLength={160}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="pack-from">From</Label>
                <Input
                  id="pack-from"
                  type="date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="pack-to">To</Label>
                <Input
                  id="pack-to"
                  type="date"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["preparer", preparer, setPreparer],
                  ["reviewer", reviewer, setReviewer],
                ] as const
              ).map(([label, value, setter]) => (
                <div key={label}>
                  <Label htmlFor={`pack-${label}`}>{label}</Label>
                  <RecordLookupSelect
                    id={`pack-${label}`}
                    className="h-9 w-full rounded border bg-background"
                    value={value}
                    onValueChange={(e) => setter(e)}
                  >
                    <option value="">
                      {label === "preparer" ? "Owner prepares" : "Choose independent reviewer"}
                    </option>
                    {workspace.members
                      .filter(
                        (m) =>
                          label !== "reviewer" || ["owner", "admin", "accountant"].includes(m.role),
                      )
                      .map((m) => (
                        <option key={m.user_id} value={m.user_id}>
                          {m.name}
                        </option>
                      ))}
                  </RecordLookupSelect>
                </div>
              ))}
            </div>
            <fieldset className="space-y-2">
              <legend className="mb-2 font-medium">Reports included</legend>
              {PACK_REPORTS.map((id) => (
                <label key={id} className="flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={config.reports.includes(id)}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        reports: e.target.checked
                          ? [...config.reports, id]
                          : config.reports.filter((v) => v !== id),
                      })
                    }
                  />
                  {titles[id]}
                </label>
              ))}
            </fieldset>
            <ol className="space-y-1">
              {config.reports.map((id, i) => (
                <li
                  key={`${id}-${i}`}
                  className="flex items-center justify-between rounded border p-2 text-sm"
                >
                  <span>
                    {i + 1}. {titles[id]}
                  </span>
                  <div>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Move ${titles[id]} earlier`}
                      disabled={!i}
                      onClick={() => {
                        const reports = [...config.reports];
                        [reports[i - 1], reports[i]] = [reports[i]!, reports[i - 1]!];
                        setConfig({ ...config, reports });
                      }}
                    >
                      ↑
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Move ${titles[id]} later`}
                      disabled={i === config.reports.length - 1}
                      onClick={() => {
                        const reports = [...config.reports];
                        [reports[i + 1], reports[i]] = [reports[i]!, reports[i + 1]!];
                        setConfig({ ...config, reports });
                      }}
                    >
                      ↓
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
            <p className="text-sm font-medium">Reuse a saved pack template</p>
            <ReportingModelSelect
              companyId={companyId}
              kind="pack_template"
              revision={String(q.dataUpdatedAt)}
              label="Reuse a saved pack template"
              onSelect={(template) => {
                const parsed = packConfigSchema.safeParse(template.config);
                if (!parsed.success) {
                  toast.error("This saved pack template configuration is invalid.");
                  return;
                }
                setConfig({ ...parsed.data, commentary: "", actionItems: [] });
              }}
            />
            <Label htmlFor="pack-header">Firm / client header</Label>
            <Input
              id="pack-header"
              value={config.header}
              maxLength={300}
              onChange={(e) => setConfig({ ...config, header: e.target.value })}
            />
            <Label htmlFor="pack-footer">Footer</Label>
            <Input
              id="pack-footer"
              value={config.footer}
              maxLength={300}
              onChange={(e) => setConfig({ ...config, footer: e.target.value })}
            />
            <Label htmlFor="pack-commentary">Executive commentary</Label>
            <Textarea
              id="pack-commentary"
              maxLength={12000}
              value={config.commentary}
              onChange={(e) => setConfig({ ...config, commentary: e.target.value })}
            />
            <section className="space-y-2">
              <h4 className="font-medium">Action items</h4>
              {config.actionItems.map((item, i) => (
                <div key={item.id} className="flex flex-wrap gap-2">
                  <Input
                    aria-label={`Action item ${i + 1}`}
                    value={item.text}
                    maxLength={500}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        actionItems: config.actionItems.map((a, j) =>
                          j === i ? { ...a, text: e.target.value } : a,
                        ),
                      })
                    }
                  />
                  <RecordLookupSelect
                    aria-label={`Assignee for action item ${i + 1}`}
                    className="h-9 rounded border bg-background"
                    value={item.assigneeId ?? ""}
                    onValueChange={(e) =>
                      setConfig({
                        ...config,
                        actionItems: config.actionItems.map((a, j) =>
                          j === i ? { ...a, assigneeId: e || null } : a,
                        ),
                      })
                    }
                  >
                    <option value="">Unassigned</option>
                    {workspace.members.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.name}
                      </option>
                    ))}
                  </RecordLookupSelect>
                  <select
                    aria-label={`Status for action item ${i + 1}`}
                    className="h-9 rounded border bg-background"
                    value={item.status}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        actionItems: config.actionItems.map((a, j) =>
                          j === i ? { ...a, status: e.target.value as typeof a.status } : a,
                        ),
                      })
                    }
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In progress</option>
                    <option value="complete">Complete</option>
                  </select>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setConfig({
                        ...config,
                        actionItems: config.actionItems.filter((a) => a.id !== item.id),
                      })
                    }
                  >
                    Remove item
                  </Button>
                </div>
              ))}
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setConfig({
                    ...config,
                    actionItems: [
                      ...config.actionItems,
                      { id: crypto.randomUUID(), text: "", assigneeId: null, status: "open" },
                    ],
                  })
                }
              >
                Add action item
              </Button>
            </section>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditor(null)}>
              Cancel
            </Button>
            <Button
              variant="outline"
              disabled={mutation.isPending || !name.trim() || !config.reports.length}
              onClick={() =>
                mutation.mutate(() =>
                  templateFn({
                    data: {
                      companyId,
                      name,
                      kind: "pack_template",
                      config: { ...config, commentary: "", actionItems: [] },
                    },
                  }),
                )
              }
            >
              Save as template
            </Button>
            <Button
              disabled={mutation.isPending || !name.trim() || !config.reports.length || start > end}
              onClick={() =>
                mutation.mutate(() =>
                  save({
                    data: {
                      companyId,
                      payload: {
                        ...(editor !== "new" && editor
                          ? { id: editor.id, version: editor.version }
                          : {}),
                        name,
                        from: start,
                        to: end,
                        reviewerId: reviewer || null,
                        preparerId: preparer || null,
                        config,
                      },
                    },
                  }),
                )
              }
            >
              Save draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {delivery && (
        <ReportDeliveryDialog
          companyId={companyId}
          target={{ packId: delivery.id }}
          name={delivery.name}
          onClose={() => setDelivery(null)}
        />
      )}
      {editingSchedule && (
        <ReportDeliveryDialog
          companyId={companyId}
          target={
            editingSchedule["pack_id"]
              ? { packId: String(editingSchedule["pack_id"]) }
              : { viewId: String(editingSchedule["view_id"]) }
          }
          name={String(editingSchedule["subject"])}
          schedule={editingSchedule}
          onClose={() => setEditingSchedule(null)}
        />
      )}
    </div>
  );
}

function HistoryPageControls({
  label,
  page,
  total,
  onPage,
}: {
  label: string;
  page: number;
  total: number;
  onPage: (page: number) => void;
}) {
  if (total <= 50 && page === 0) return null;
  return (
    <nav aria-label={`${label} pages`} className="flex flex-wrap items-center gap-2 text-sm">
      <span>
        {label}: {total} records · page {page + 1} of {Math.max(1, Math.ceil(total / 50))}
      </span>
      <Button
        size="sm"
        variant="outline"
        disabled={page === 0}
        onClick={() => onPage(page - 1)}
        aria-label={`Previous ${label.toLowerCase()} page`}
      >
        Previous
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={(page + 1) * 50 >= total}
        onClick={() => onPage(page + 1)}
        aria-label={`Next ${label.toLowerCase()} page`}
      >
        Next
      </Button>
    </nav>
  );
}
