import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArrowUpRight,
  Bell,
  Check,
  FilePlus2,
  Loader2,
  RefreshCcw,
  RotateCcw,
} from "lucide-react";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { safeNotificationPath, type ActionNotification } from "@/hooks/use-action-notifications";
import { useActionCenterFeed } from "@/hooks/use-action-center-feed";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/notify";
import { NotificationPreferences } from "@/components/notifications/NotificationPreferences";
import {
  filterActionNotifications,
  sortActionNotifications,
  summarizeActionNotifications,
  mergeNotificationPages,
  parseActionCenterSearch,
  type NotificationSort,
  type NotificationView,
} from "@/lib/notifications/notification-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/notifications")({
  validateSearch: parseActionCenterSearch,
  head: () => ({ meta: [{ title: "Action Center — LinkBooks" }] }),
  component: ActionCenterPage,
});

type View = NotificationView;
const VIEWS: { key: View; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "action", label: "Action required" },
  { key: "critical", label: "Critical" },
  { key: "completed", label: "Completed" },
  { key: "archived", label: "Archived" },
];
const CATEGORIES: Record<string, string> = {
  bill_approval: "Bill approvals",
  overdue_invoice: "Overdue invoices",
  bank_reconciliation: "Bank reconciliation",
  document_request: "Document requests",
  contact_followup: "Contact follow-ups",
  system: "System",
};
const PAGE_SIZE = 20;

function ActionCenterPage() {
  const { user } = useRouteContext({ from: "/_authenticated" });
  const { company } = useActiveCompany();
  const companyId = company?.id ?? null;
  const { inbox, unreadQuery, changeState, refresh } = useActionCenterFeed(
    companyId,
    user.id,
  );
  const query = Route.useSearch();
  const navigate = Route.useNavigate();
  const view = query.view ?? "action";
  const category = query.category ?? "all";
  const priority = query.priority ?? "all";
  const sort: NotificationSort = query.sort ?? "priority";
  const search = query.q ?? "";
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const rows = useMemo(
    () => mergeNotificationPages(inbox.data?.pages ?? []),
    [inbox.data?.pages],
  );
  const visibleIds = useMemo(
    () => new Set(rows.filter((row) => row.company_id === companyId).map((row) => row.id)),
    [rows, companyId],
  );
  const validSelected = selected.filter((id) => visibleIds.has(id));
  useEffect(() => {
    setSelected([]);
    setPage(0);
    setBulkError(null);
  }, [companyId, user.id]);
  const changeFilters = (patch: Record<string, unknown>) => {
    void navigate({
      search: (previous) => parseActionCenterSearch({ ...previous, ...patch }),
      replace: true,
      resetScroll: false,
    });
    setSelected([]);
    setPage(0);
  };

  const summary = useMemo(() => summarizeActionNotifications(rows), [rows]);
  const filtered = useMemo(
    () =>
      sortActionNotifications(
        filterActionNotifications(rows, { view, category, priority, search }),
        sort,
      ),
    [rows, view, category, priority, search, sort],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(
    Math.min(page, pageCount - 1) * PAGE_SIZE,
    (Math.min(page, pageCount - 1) + 1) * PAGE_SIZE,
  );
  const onViewNavigate = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    setPage(0);
    setSelected([]);
  };
  const onCategory = (next: string) =>
    changeFilters({ category: next === "all" ? undefined : next });
  const pageIds = pageRows.map((row) => row.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => validSelected.includes(id));
  const togglePageSelection = (checked: boolean) =>
    setSelected((previous) =>
      checked
        ? [...new Set([...previous.filter((id) => visibleIds.has(id)), ...pageIds])]
        : previous.filter((id) => visibleIds.has(id) && !pageIds.includes(id)),
    );

  async function bulkState(action: "read" | "archive") {
    if (!validSelected.length || bulkBusy || changeState.isPending) return;
    setBulkBusy(true);
    setBulkError(null);
    const failed: string[] = [];
    let updated = 0;
    let firstError: string | null = null;
    for (const id of validSelected) {
      try {
        const { data, error } = await supabase.rpc(
          "set_action_notification_state" as never,
          {
            _notification_id: id,
            _mark_read: action === "read" ? true : null,
            _archive: action === "archive" ? true : null,
          } as never,
        );
        if (error) throw error;
        if (!data) throw new Error("An alert is no longer available or permission was revoked");
        updated++;
      } catch (error) {
        failed.push(id);
        firstError ??= error instanceof Error ? error.message : "Update was rejected";
      }
    }
    setSelected(failed);
    try {
      await refresh();
    } catch (error) {
      setBulkError(error instanceof Error ? error.message : "Could not refresh alerts");
    } finally {
      setBulkBusy(false);
    }
    if (updated) {
      notify.success(
        action === "read"
          ? `${updated} notification(s) marked as read`
          : `${updated} notification(s) archived`,
      );
    }
    if (failed.length) {
      setBulkError(`${failed.length} notification(s) could not be updated. ${firstError ?? ""}`);
    }
  }
  const toggleSelection = (id: string) => {
    if (!visibleIds.has(id)) return;
    setSelected((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Bell className="size-6" />
            Smart Action Center
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {company?.name ?? "Current organisation"} · {unreadQuery.data ?? 0} unread alerts
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Review source records before taking action. Archiving an alert never approves or posts a transaction.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={!companyId || inbox.isFetching}
          onClick={() => void refresh()}
        >
          <RefreshCcw className="mr-2 size-4" />
          Refresh alerts
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Action Center overview">
        {(
          [
            { label: "Needs action", value: summary.action, view: "action" as View, detail: "Open alerts" },
            { label: "Unread", value: unreadQuery.data ?? summary.unread, view: "unread" as View, detail: "All accessible unread" },
            { label: "Critical", value: summary.critical, view: "critical" as View, detail: "Urgent open alerts" },
            { label: "Completed", value: summary.completed, view: "completed" as View, detail: "Resolved alerts" },
          ]
        ).map((metric) => (
          <Link
            key={metric.view}
            to="/notifications"
            search={{ view: metric.view }}
            onClick={onViewNavigate}
            className="rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-2 focus-visible:outline-ring"
          >
            <span className="text-xs font-medium text-muted-foreground">{metric.label}</span>
            <span className="mt-2 block text-2xl font-semibold tabular-nums">
              {inbox.isPending ? "—" : metric.value.toLocaleString()}
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">{metric.detail}</span>
          </Link>
        ))}
      </div>
      {rows.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Workload counters and filters cover {rows.length} loaded alerts. Unread count covers your full
          accessible inbox. Use Load older alerts to include earlier records.
        </p>
      )}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Notification views">
        {VIEWS.map((item) => (
          <Button
            key={item.key}
            size="sm"
            variant={view === item.key ? "default" : "outline"}
            asChild
          >
            <Link
              to="/notifications"
              search={{ ...query, view: item.key }}
              onClick={onViewNavigate}
            >
              {item.label}
            </Link>
          </Button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_220px_160px_170px]">
        <Input
          aria-label="Search notifications"
          placeholder="Search actions, invoices, bills…"
          value={search}
          maxLength={120}
          onChange={(e) => changeFilters({ q: e.target.value || undefined })}
        />
        <Select value={category} onValueChange={onCategory}>
          {/* lookup-fixed-enum: Short schema or presentation enumeration, not selectable business records. */}
          <SelectTrigger aria-label="Filter by module">
            <SelectValue placeholder="All modules" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All modules</SelectItem>
            {Object.entries(CATEGORIES).map(([id, title]) => (
              <SelectItem key={id} value={id}>
                {title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={priority}
          onValueChange={(next) =>
            changeFilters({ priority: next === "all" ? undefined : next })
          }
        >
          {/* lookup-fixed-enum: Notification priority enumeration. */}
          <SelectTrigger aria-label="Filter by priority">
            <SelectValue placeholder="All priorities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={sort}
          onValueChange={(next) =>
            changeFilters({ sort: next === "priority" ? undefined : next })
          }
        >
          {/* lookup-fixed-enum: Notification display order enumeration. */}
          <SelectTrigger aria-label="Sort notifications">
            <SelectValue placeholder="Sort notifications" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="priority">Priority first</SelectItem>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {(search || category !== "all" || priority !== "all" || sort !== "priority") && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">{filtered.length} matching alerts</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              changeFilters({
                q: undefined,
                category: undefined,
                priority: undefined,
                sort: undefined,
              })
            }
          >
            Clear filters
          </Button>
        </div>
      )}
      {validSelected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm" aria-live="polite">
          <span>{validSelected.length} selected</span>
          <Button size="sm" disabled={bulkBusy || changeState.isPending} onClick={() => void bulkState("read")}>
            Mark selected read
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={bulkBusy || changeState.isPending}
            onClick={() => void bulkState("archive")}
          >
            Archive selected
          </Button>
          <Button size="sm" variant="ghost" disabled={bulkBusy} onClick={() => setSelected([])}>
            Clear
          </Button>
        </div>
      )}
      {bulkError && (
        <p role="alert" className="text-sm text-destructive">
          {bulkError}
        </p>
      )}
      {inbox.isPending ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading your actions…
        </p>
      ) : inbox.isError && !inbox.data ? (
        <div role="alert" className="rounded-lg border p-4">
          <p>
            Could not load Action Center:{" "}
            {inbox.error instanceof Error ? inbox.error.message : "Unknown error"}
          </p>
          <Button variant="outline" className="mt-2" onClick={() => void inbox.refetch()}>
            Retry
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="space-y-3 rounded-lg border px-6 py-12 text-center text-muted-foreground">
          <p>No matching notifications in the loaded history.</p>
          {inbox.hasNextPage && (
            <Button
              variant="outline"
              disabled={inbox.isFetchingNextPage}
              onClick={() => void inbox.fetchNextPage()}
            >
              {inbox.isFetchingNextPage ? "Loading older alerts…" : "Search older alerts"}
            </Button>
          )}
          {inbox.isFetchNextPageError && (
            <p role="alert" className="text-sm text-destructive">
              Could not load older alerts. Retry using Search older alerts.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-sm">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={allPageSelected}
                disabled={bulkBusy || changeState.isPending}
                onChange={(event) => togglePageSelection(event.target.checked)}
                aria-label="Select all notifications on this page"
                className="size-4 accent-primary"
              />
              Select page ({pageRows.length})
            </label>
            <span className="text-xs text-muted-foreground">Selection applies only to notifications you choose</span>
          </div>
          {pageRows.map((n) => (
            <NotificationRow
              key={n.id}
              item={n}
              selected={validSelected.includes(n.id)}
              onSelect={() => toggleSelection(n.id)}
              busy={changeState.isPending || bulkBusy}
              change={(read, archive) =>
                changeState.mutate({
                  id: n.id,
                  ...(read !== undefined ? { read } : {}),
                  ...(archive !== undefined ? { archive } : {}),
                })
              }
            />
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 text-sm text-muted-foreground">
            <span>
              {filtered.length} matching · Page {Math.min(page, pageCount - 1) + 1} of {pageCount}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page === 0}
                onClick={() => setPage((n) => Math.max(0, n - 1))}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page + 1 >= pageCount}
                onClick={() => setPage((n) => n + 1)}
              >
                Next
              </Button>
            </div>
          </div>
          {inbox.hasNextPage && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">
                Filters and sorting apply to loaded history. Older alerts are available on demand.
              </p>
              <Button
                variant="outline"
                disabled={inbox.isFetchingNextPage || bulkBusy}
                onClick={() => void inbox.fetchNextPage()}
              >
                {inbox.isFetchingNextPage ? "Loading older alerts…" : "Load older alerts"}
              </Button>
            </div>
          )}
          {inbox.isFetchNextPageError && (
            <p role="alert" className="text-sm text-destructive">
              Could not load older alerts. You can retry.
            </p>
          )}
        </div>
      )}
      <NotificationPreferences companyId={companyId} userId={user.id} />
      <DocumentRequests companyId={companyId} userId={user.id} />
    </div>
  );
}

function NotificationRow({
  item: n,
  selected,
  onSelect,
  busy,
  change,
}: {
  item: ActionNotification;
  selected: boolean;
  onSelect: () => void;
  busy: boolean;
  change: (read?: boolean, archive?: boolean) => void;
}) {
  const path = safeNotificationPath(n.target_path);
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-primary/40">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          disabled={busy}
          onChange={onSelect}
          className="mt-1 size-4 accent-primary"
          aria-label={`Select ${n.title}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {!n.read_at && <span className="size-2 rounded-full bg-primary" aria-label="Unread" />}
            <h2 className="font-semibold">
              {path ? (
                <a
                  href={path}
                  className="underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {n.title}
                </a>
              ) : (
                n.title
              )}
            </h2>
            <span
              className={
                n.priority === "critical"
                  ? "rounded bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold uppercase text-destructive"
                  : n.priority === "high"
                    ? "rounded bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase text-amber-700 dark:text-amber-300"
                    : "rounded bg-muted px-2 py-0.5 text-[11px] font-medium uppercase"
              }
            >
              {n.priority}
            </span>
            {n.archived_at && <span className="text-xs text-muted-foreground">Archived</span>}
            {n.resolved_at && !n.archived_at && (
              <span className="text-xs text-muted-foreground">Completed</span>
            )}
            <span className="text-xs text-muted-foreground">
              {CATEGORIES[n.category] ?? n.category}
            </span>
          </div>
          {n.body && <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>}
          <p className="mt-1 text-xs text-muted-foreground">
            {new Date(n.created_at).toLocaleString()}
            {n.resolved_at && " · Underlying task completed"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {path && (
              <Button size="sm" variant="outline" asChild>
                <a href={path}>
                  {n.category === "document_request"
                    ? "Upload document"
                    : n.category === "contact_followup"
                      ? "Open follow-up"
                      : n.category === "bill_approval"
                        ? "Review bill"
                        : n.category === "overdue_invoice"
                          ? "Review invoice"
                          : n.category === "bank_reconciliation"
                            ? "Reconcile bank"
                            : "Review and act"}
                  <ArrowUpRight className="ml-1 size-3" />
                </a>
              </Button>
            )}
            {n.category === "overdue_invoice" && !n.resolved_at && (
              <Button size="sm" variant="outline" asChild>
                <a href="/sales/reminders">
                  Open reminder center <ArrowUpRight className="ml-1 size-3" />
                </a>
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => change(!n.read_at, undefined)}
            >
              <Check className="mr-1 size-3" />
              {n.read_at ? "Mark unread" : "Mark read"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => change(undefined, !n.archived_at)}
            >
              {n.archived_at ? (
                <RotateCcw className="mr-1 size-3" />
              ) : (
                <Archive className="mr-1 size-3" />
              )}
              {n.archived_at ? "Restore" : "Archive"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

type RequestRow = {
  id: string;
  subject: string;
  instructions: string;
  created_at: string;
  requested_by: string;
  requested_from: string;
  completed_at: string | null;
  cancelled_at: string | null;
};
type Recipient = { user_id: string; display_name: string };
type Attachment = { id: string; file_name: string; created_at: string; uploaded_by: string };

function DocumentRequests({ companyId, userId }: { companyId: string | null; userId: string }) {
  const { can } = useCan();
  const queryClient = useQueryClient();
  const mayRequest = can("sales.draft") || can("purchases.draft") || can("accounting.post");
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [instructions, setInstructions] = useState("");
  const [uploaded, setUploaded] = useState<Record<string, string>>({});
  const key = ["action-document-requests", companyId];
  const recipients = useQuery({
    queryKey: ["action-document-recipients", companyId],
    enabled: !!companyId && mayRequest,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "list_action_document_recipients" as never,
        {
          _company_id: companyId,
        } as never,
      );
      if (error) throw error;
      return (data ?? []) as Recipient[];
    },
  });
  const requests = useQuery({
    queryKey: key,
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("action_document_requests" as never)
        .select(
          "id,subject,instructions,created_at,requested_by,requested_from,completed_at,cancelled_at" as never,
        )
        .eq("company_id" as never, companyId as never)
        .order("created_at" as never, { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as RequestRow[];
    },
  });
  const files = useQuery({
    queryKey: ["action-document-uploads", companyId, userId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_attachments" as never)
        .select("id,file_name,created_at,uploaded_by" as never)
        .eq("company_id" as never, companyId as never)
        .eq("entity_type" as never, "company" as never)
        .eq("uploaded_by" as never, userId as never)
        .order("created_at" as never, { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as Attachment[];
    },
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: key });
    void queryClient.invalidateQueries({ queryKey: ["action-notifications", companyId] });
    void queryClient.invalidateQueries({ queryKey: ["action-center-feed", companyId] });
  };
  const createRequest = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc(
        "create_action_document_request" as never,
        {
          _company_id: companyId,
          _requested_from: recipient,
          _subject: subject,
          _instructions: instructions,
        } as never,
      );
      if (error) throw error;
    },
    onSuccess: () => {
      setSubject("");
      setInstructions("");
      setRecipient("");
      refresh();
      notify.success("Document request sent");
    },
    onError: (e) => notify.error(e, "Could not request document"),
  });
  const finishRequest = useMutation({
    mutationFn: async ({ id, attachmentId }: { id: string; attachmentId: string }) => {
      const { data, error } = await supabase.rpc(
        "complete_action_document_request" as never,
        {
          _request_id: id,
          _attachment_id: attachmentId,
        } as never,
      );
      if (error) throw error;
      if (!data) throw new Error("Could not complete document request");
    },
    onSuccess: () => {
      refresh();
      notify.success("Document request fulfilled");
    },
    onError: (e) => notify.error(e, "Could not fulfill request"),
  });
  const cancelRequest = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc(
        "cancel_action_document_request" as never,
        {
          _request_id: id,
        } as never,
      );
      if (error) throw error;
      if (!data) throw new Error("Could not cancel document request");
    },
    onSuccess: () => {
      refresh();
      notify.success("Document request cancelled");
    },
    onError: (e) => notify.error(e, "Could not cancel request"),
  });
  if (!companyId) return null;
  const openRequests = (requests.data ?? []).filter((r) => !r.cancelled_at && !r.completed_at);
  const incoming = openRequests.filter((r) => r.requested_from === userId);
  const outgoing = openRequests.filter((r) => r.requested_by === userId);
  return (
    <section className="space-y-4" aria-label="Document requests">
      <h2 className="text-xl font-semibold">Document requests</h2>
      {mayRequest && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FilePlus2 className="size-4" />
              Request a company document
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-3 md:grid-cols-[1fr_1fr]"
              onSubmit={(e) => {
                e.preventDefault();
                if (recipient && subject.trim().length >= 3) createRequest.mutate();
              }}
            >
              <div className="space-y-1">
                <label className="text-sm font-medium">Team member</label>
                <RecordLookupSelect value={recipient} onValueChange={setRecipient}>
                  <SelectTrigger aria-label="Select document recipient">
                    <SelectValue placeholder="Choose colleague" />
                  </SelectTrigger>
                  <SelectContent>
                    {(recipients.data ?? []).map((r) => (
                      <SelectItem key={r.user_id} value={r.user_id}>
                        {r.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </RecordLookupSelect>
              </div>
              <div className="space-y-1">
                <label htmlFor="doc-request-subject" className="text-sm font-medium">
                  Document needed
                </label>
                <Input
                  id="doc-request-subject"
                  value={subject}
                  maxLength={160}
                  placeholder="e.g. September bank statement"
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label htmlFor="doc-request-instructions" className="text-sm font-medium">
                  Instructions (optional)
                </label>
                <Textarea
                  id="doc-request-instructions"
                  value={instructions}
                  maxLength={2000}
                  rows={2}
                  placeholder="Explain what to upload"
                  onChange={(e) => setInstructions(e.target.value)}
                />
              </div>
              {recipients.isError && (
                <p role="alert" className="text-sm text-destructive md:col-span-2">
                  Could not load eligible team members
                </p>
              )}
              <Button
                type="submit"
                className="justify-self-start"
                disabled={createRequest.isPending || !recipient || subject.trim().length < 3}
              >
                {createRequest.isPending ? "Sending…" : "Send request"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
      {requests.isError && (
        <p role="alert" className="text-sm text-destructive">
          Could not load document requests
        </p>
      )}
      {requests.isPending && (
        <p className="text-sm text-muted-foreground">Loading document requests…</p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Requests assigned to me ({incoming.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {incoming.length === 0 && (
              <p className="text-sm text-muted-foreground">No open requests assigned to you</p>
            )}
            {incoming.map((r) => {
              const matches = (files.data ?? []).filter((f) => f.created_at >= r.created_at);
              return (
                <div key={r.id} className="space-y-2 rounded border p-3 text-sm">
                  <div className="font-medium">{r.subject}</div>
                  {r.instructions && <p className="text-muted-foreground">{r.instructions}</p>}
                  <a
                    href="/files"
                    className="inline-flex items-center gap-1 text-primary underline"
                  >
                    Upload in Files <ArrowUpRight className="size-3" />
                  </a>
                  <RecordLookupSelect
                    value={uploaded[r.id] ?? ""}
                    onValueChange={(id) => setUploaded((old) => ({ ...old, [r.id]: id }))}
                  >
                    <SelectTrigger aria-label={`Attachment for ${r.subject}`}>
                      <SelectValue placeholder="Select a file you uploaded for this request" />
                    </SelectTrigger>
                    <SelectContent>
                      {matches.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.file_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </RecordLookupSelect>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => void files.refetch()}>
                      Refresh uploaded files
                    </Button>
                    <Button
                      size="sm"
                      disabled={!uploaded[r.id] || finishRequest.isPending}
                      onClick={() =>
                        finishRequest.mutate({ id: r.id, attachmentId: uploaded[r.id]! })
                      }
                    >
                      <Check className="mr-1 size-3" />
                      Mark fulfilled
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Requests I sent ({outgoing.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {outgoing.length === 0 && (
              <p className="text-sm text-muted-foreground">No pending requests</p>
            )}
            {outgoing.map((r) => (
              <div key={r.id} className="rounded border p-3 text-sm">
                <div className="font-medium">{r.subject}</div>
                <p className="text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()}
                </p>
                <Button
                  className="mt-2"
                  size="sm"
                  variant="outline"
                  disabled={cancelRequest.isPending}
                  onClick={() => {
                    if (window.confirm("Cancel this document request?")) cancelRequest.mutate(r.id);
                  }}
                >
                  Cancel request
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
