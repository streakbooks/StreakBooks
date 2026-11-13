import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArrowUpRight,
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
import { ActionCenterSearchForm } from "@/components/notifications/ActionCenterSearchForm";
import { runNotificationBulk } from "@/lib/notifications/bulk-actions";
import {
  mergeNotificationPages,
  groupNotificationPage,
  parseActionCenterSearch,
  type NotificationSort,
  type NotificationView,
} from "@/lib/notifications/notification-utils";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/common/StatusBadge";
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
  expense_claim: "Expense claims",
  hr_alert: "HR alerts",
  system: "System",
};
const PAGE_SIZE = 20;
const MODULE_DESTINATIONS: Record<string, string> = {
  bill_approval: "/purchases/bills",
  overdue_invoice: "/sales/invoices",
  bank_reconciliation: "/banking/reconcile",
  document_request: "/files",
  contact_followup: "/contacts",
  expense_claim: "/expenses",
  hr_alert: "/hr",
};

function ActionCenterPage() {
  const { user } = useRouteContext({ from: "/_authenticated" });
  const { company } = useActiveCompany();
  const companyId = company?.id ?? null;
  const query = Route.useSearch();
  const navigate = Route.useNavigate();
  const view = query.view ?? "action";
  const category = query.category ?? "all";
  const priority = query.priority ?? "all";
  const sort: NotificationSort = query.sort ?? "priority";
  const search = query.q ?? "";
  const { inbox, workload, unreadQuery, changeState, refresh } = useActionCenterFeed(
    companyId,
    user.id,
    { view, category, priority, search, sort },
  );
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [groupByModule, setGroupByModule] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkTotal, setBulkTotal] = useState(0);
  const busyRef = useRef(false);
  const scopeKey = [companyId, user.id, view, category, priority, search, sort].join("|");
  const activeScopeRef = useRef(scopeKey);
  const scopeVersionRef = useRef(0);
  const [retryAction, setRetryAction] = useState<"read" | "archive" | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const rows = useMemo(
    () => mergeNotificationPages(inbox.data?.pages.map((item) => item.rows) ?? []),
    [inbox.data?.pages],
  );
  const visibleIds = useMemo(
    () => new Set(rows.filter((row) => row.company_id === companyId).map((row) => row.id)),
    [rows, companyId],
  );
  const validSelected = selected.filter((id) => visibleIds.has(id));
  const invalidateBulk = () => {
    // Increment even if a filter later returns to the same value: a stale
    // in-flight operation must never restart in the newly selected view.
    scopeVersionRef.current += 1;
    busyRef.current = false;
    setBulkBusy(false);
    setBulkProgress(0);
    setBulkTotal(0);
    setRetryAction(null);
  };
  useEffect(() => {
    scopeVersionRef.current += 1;
    activeScopeRef.current = scopeKey;
    busyRef.current = false;
    setSelected([]);
    setPage(0);
    setBulkError(null);
    setRetryAction(null);
    setBulkBusy(false);
    setBulkProgress(0);
    setBulkTotal(0);
    return () => {
      scopeVersionRef.current += 1;
      activeScopeRef.current = "";
    };
  }, [scopeKey]);
  const changeFilters = (patch: Record<string, unknown>) => {
    invalidateBulk();
    void navigate({
      search: (previous) => parseActionCenterSearch({ ...previous, ...patch }),
      replace: true,
      resetScroll: false,
    });
    setSelected([]);
    setPage(0);
  };

  const totalMatches = inbox.data?.pages[0]?.total ?? 0;
  const summary = workload.data;
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice(
    Math.min(page, pageCount - 1) * PAGE_SIZE,
    (Math.min(page, pageCount - 1) + 1) * PAGE_SIZE,
  );
  const pageGroups = groupByModule
    ? groupNotificationPage(pageRows)
    : [{ category: "all", rows: pageRows }];
  const onViewNavigate = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    invalidateBulk();
    setPage(0);
    setSelected([]);
  };
  const onCategory = (next: string) =>
    changeFilters({ category: next === "all" ? undefined : next });
  const pageIds = pageRows.map((row) => row.id);
  const selectedPageCount = pageIds.filter((id) => validSelected.includes(id)).length;
  const allPageSelected = pageIds.length > 0 && selectedPageCount === pageIds.length;
  const toggleIds = (ids: readonly string[], checked: boolean) => {
    if (bulkBusy || changeState.isPending) return;
    setRetryAction(null);
    setBulkError(null);
    const allowed = ids.filter((id) => visibleIds.has(id));
    setSelected((previous) =>
      checked
        ? [...new Set([...previous.filter((id) => visibleIds.has(id)), ...allowed])]
        : previous.filter((id) => visibleIds.has(id) && !allowed.includes(id)),
    );
  };
  const togglePageSelection = (checked: boolean) => toggleIds(pageIds, checked);

  async function bulkState(action: "read" | "archive") {
    // The version token prevents an old operation from resuming if the user
    // quickly navigates away and back to an identical filter scope.
    if (!validSelected.length || busyRef.current || changeState.isPending) return;
    const runScope = activeScopeRef.current;
    const runVersion = scopeVersionRef.current;
    const isCurrent = () =>
      activeScopeRef.current === runScope && scopeVersionRef.current === runVersion;
    const ids = [...validSelected];
    busyRef.current = true;
    setBulkBusy(true);
    setBulkProgress(0);
    setBulkTotal(ids.length);
    setBulkError(null);
    setRetryAction(null);

    try {
      const result = await runNotificationBulk(
        ids,
        async (id) => {
          const { data, error } = await supabase.rpc(
            "set_action_notification_state" as never,
            {
              _notification_id: id,
              _mark_read: action === "read" ? true : null,
              _archive: action === "archive" ? true : null,
            } as never,
          );
          if (error) throw error;
          if (!data) throw new Error("Alert unavailable or permission was revoked");
        },
        isCurrent,
        (completed) => setBulkProgress(completed),
      );

      if (!isCurrent() || result.cancelled) return;
      setSelected(result.failedIds);

      if (result.updated) {
        notify.success(
          action === "read"
            ? `${result.updated} notification(s) marked as read`
            : `${result.updated} notification(s) archived`,
        );
      }
      if (result.failedIds.length) {
        setBulkError(
          `${result.failedIds.length} notification(s) could not be updated. ${result.firstError ?? ""}`,
        );
        setRetryAction(action);
      }
    } finally {
      // Always invalidate the original company's caches, including when the
      // visible scope has changed while a network request was in progress.
      try {
        await refresh();
      } catch (error) {
        if (isCurrent()) {
          setBulkError(error instanceof Error ? error.message : "Could not refresh alerts");
        }
      }
      if (isCurrent()) {
        busyRef.current = false;
        setBulkBusy(false);
        setBulkProgress(0);
        setBulkTotal(0);
      }
    }
  }
  const toggleSelection = (id: string) => {
    if (!visibleIds.has(id) || busyRef.current || changeState.isPending) return;
    setRetryAction(null);
    setBulkError(null);
    setSelected((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  };

  return (
    <div data-action-center-root>
      <ListWorkspace
      className="space-y-6"
      title="Smart Action Center"
      description={`${company?.name ?? "Current organisation"} · ${unreadQuery.data?.toLocaleString() ?? "—"} unread alerts. Review source records before taking action. Archiving an alert never approves or posts a transaction.`}
      actions={
        <Button
          variant="outline"
          disabled={!companyId || inbox.isFetching}
          onClick={() => void refresh()}
        >
          <RefreshCcw className="mr-2 size-4" />
          Refresh alerts
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Action Center overview">
        {(
          [
            { label: "Needs action", value: summary?.action, view: "action" as View, detail: "Open alerts" },
            { label: "Unread", value: summary?.unread, view: "unread" as View, detail: "All accessible unread" },
            { label: "Critical", value: summary?.critical, view: "critical" as View, detail: "Urgent open alerts" },
            { label: "Completed", value: summary?.completed, view: "completed" as View, detail: "Resolved alerts" },
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
              {metric.value === undefined ? "—" : metric.value.toLocaleString()}
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">{metric.detail}</span>
          </Link>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Workload counts cover your full accessible inbox. Filters and priority ordering
        run on the server before alerts are paged.
      </p>
      {workload.isError && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
          Could not load complete workload counts.
          <Button size="sm" variant="outline" onClick={() => void workload.refetch()}>
            Retry counts
          </Button>
        </div>
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
              aria-current={view === item.key ? "page" : undefined}
              onClick={onViewNavigate}
            >
              {item.label}
            </Link>
          </Button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_220px_160px_170px]">
        <ActionCenterSearchForm
          key={search}
          appliedSearch={search}
          onSearch={(value) => changeFilters({ q: value || undefined })}
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
          <span aria-live="polite" className="text-xs text-muted-foreground">
            {inbox.isPending ? "Searching…" : totalMatches.toLocaleString() + " matching alerts"}
          </span>
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
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
          <div>
            <Button
              size="sm"
              variant={groupByModule ? "secondary" : "outline"}
              aria-pressed={groupByModule}
              disabled={bulkBusy}
              onClick={() => setGroupByModule((current) => !current)}
            >
              Group page by module
            </Button>
          </div>
          <span className="text-xs text-muted-foreground">
            Grouping reorganises only this page ({pageRows.length} alerts)
          </span>
        </div>
      )}
      {validSelected.length > 0 && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm" aria-live="polite">
          <span>
            {bulkBusy
              ? `Updating ${bulkProgress} of ${bulkTotal} selected alerts…`
              : `${validSelected.length} selected`}
          </span>
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
          <Button
            size="sm"
            variant="ghost"
            disabled={bulkBusy}
            onClick={() => {
              setSelected([]);
              setRetryAction(null);
              setBulkError(null);
            }}
          >
            Clear
          </Button>
        </div>
      )}
      {bulkError && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
          <span>{bulkError}</span>
          {retryAction && validSelected.length > 0 && !bulkBusy && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void bulkState(retryAction)}
            >
              Retry failed alerts ({validSelected.length})
            </Button>
          )}
        </div>
      )}
      {inbox.isError && inbox.data && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
          Could not refresh the latest notifications. Displayed alerts may be outdated.
          <Button size="sm" variant="outline" onClick={() => void inbox.refetch()}>
            Retry refresh
          </Button>
        </div>
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
      ) : rows.length === 0 ? (
        <div className="rounded-lg border px-6 py-12 text-center text-muted-foreground">
          No matching notifications across your accessible history.
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-sm">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={allPageSelected}
                ref={(node) => {
                  if (node) node.indeterminate = selectedPageCount > 0 && !allPageSelected;
                }}
                disabled={bulkBusy || changeState.isPending}
                onChange={(event) => togglePageSelection(event.target.checked)}
                aria-label="Select all notifications on this page"
                className="size-4 accent-primary"
              />
              Select page ({pageRows.length})
            </label>
            <span className="text-xs text-muted-foreground">Selection applies only to notifications you choose</span>
          </div>
          {pageGroups.map((group) => {
            const groupIds = group.rows.map((item) => item.id);
            const allGroupSelected = groupIds.every((id) => validSelected.includes(id));
            const modulePath = MODULE_DESTINATIONS[group.category];
            return (
              <section
                key={group.category}
                aria-label={groupByModule ? `${CATEGORIES[group.category] ?? group.category} alerts on this page` : "Notifications"}
                className="space-y-2"
              >
                {groupByModule && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2">
                    <h2 className="text-sm font-semibold">
                      {CATEGORIES[group.category] ?? group.category}
                      <span className="ml-2 font-normal text-muted-foreground">
                        ({group.rows.length} on this page)
                      </span>
                    </h2>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={bulkBusy || changeState.isPending}
                        onClick={() => toggleIds(groupIds, !allGroupSelected)}
                        aria-label={`${allGroupSelected ? "Unselect" : "Select"} ${CATEGORIES[group.category] ?? group.category} alerts on this page`}
                      >
                        {allGroupSelected ? "Unselect group" : "Select group"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={bulkBusy}
                        aria-label={`Show only ${CATEGORIES[group.category] ?? group.category} alerts`}
                        onClick={() => changeFilters({ category: group.category })}
                      >
                        Filter module
                      </Button>
                      {modulePath && (
                        <a
                          href={modulePath}
                          className="inline-flex min-h-8 items-center gap-1 rounded px-2 text-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                        >
                          Open module <ArrowUpRight className="size-3" aria-hidden="true" />
                        </a>
                      )}
                    </div>
                  </div>
                )}
                {group.rows.map((n) => (
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
              </section>
            );
          })}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 text-sm text-muted-foreground" aria-live="polite">
            <span>
              {rows.length.toLocaleString()} of {totalMatches.toLocaleString()} matching loaded ·
              Page {Math.min(page, pageCount - 1) + 1} of {Math.max(1, Math.ceil(totalMatches / PAGE_SIZE))}
            </span>
            <nav aria-label="Notification pages" className="flex gap-2">
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
                disabled={(page + 1 >= pageCount && !inbox.hasNextPage) || inbox.isFetchingNextPage}
                onClick={() => {
                  if (page + 1 < pageCount) {
                    setPage((n) => n + 1);
                  } else if (inbox.hasNextPage) {
                    void inbox.fetchNextPage().then((result) => {
                      if (result.isSuccess) setPage((n) => n + 1);
                    });
                  }
                }}
              >
                Next
              </Button>
            </nav>
          </div>
          {inbox.hasNextPage && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">
                All filters and sorting apply across your accessible notification history.
              </p>
              <Button
                variant="outline"
                disabled={inbox.isFetchingNextPage || bulkBusy}
                onClick={() => void inbox.fetchNextPage()}
              >
                {inbox.isFetchingNextPage ? "Loading more alerts…" : "Load more matching alerts"}
              </Button>
            </div>
          )}
          {inbox.isFetchNextPageError && (
            <p role="alert" className="text-sm text-destructive">
              Could not load more matching alerts. You can retry.
            </p>
          )}
        </div>
      )}
      <NotificationPreferences companyId={companyId} userId={user.id} />
      <DocumentRequests companyId={companyId} userId={user.id} />
      </ListWorkspace>
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
    <article
      data-action-notification-id={n.id}
      className="rounded-xl border bg-card p-3 shadow-sm transition-colors hover:border-primary/40 sm:p-4"
    >
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
            <h2 className="min-w-0 break-words text-sm font-semibold sm:text-base">
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
            {n.archived_at ? (
              <StatusBadge status="archived" />
            ) : n.resolved_at ? (
              <StatusBadge status="completed" />
            ) : null}
            <span className="text-xs text-muted-foreground">
              {CATEGORIES[n.category] ?? n.category}
            </span>
          </div>
          {n.body && <p className="mt-1 break-words text-sm text-muted-foreground">{n.body}</p>}
          <p className="mt-1 text-xs text-muted-foreground">
            {new Date(n.created_at).toLocaleString()}
            {n.resolved_at && " · Underlying task completed"}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {path && (
              <Button size="sm" variant="outline" asChild className="col-span-2 sm:col-span-1">
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
              <Button size="sm" variant="outline" asChild className="col-span-2 sm:col-span-1">
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
    </article>
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
    void queryClient.invalidateQueries({ queryKey: ["action-center-summary", companyId] });
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
