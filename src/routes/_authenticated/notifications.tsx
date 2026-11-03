import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useMemo, useState } from "react";
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
import {
  useActionNotifications,
  safeNotificationPath,
  type ActionNotification,
} from "@/hooks/use-action-notifications";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/notify";
import { NotificationPreferences } from "@/components/notifications/NotificationPreferences";
import { filterActionNotifications } from "@/lib/notifications/notification-utils";
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
  validateSearch: (raw: Record<string, unknown>): { view?: View | undefined } => ({
    view: ["all", "unread", "action", "critical", "completed", "archived"].includes(
      String(raw["view"]),
    )
      ? (raw["view"] as View)
      : undefined,
  }),
  head: () => ({ meta: [{ title: "Action Center — LinkBooks" }] }),
  component: ActionCenterPage,
});

type View = "all" | "unread" | "action" | "critical" | "completed" | "archived";
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
  system: "System",
};
const PAGE_SIZE = 20;

function ActionCenterPage() {
  const { user } = useRouteContext({ from: "/_authenticated" });
  const { company } = useActiveCompany();
  const companyId = company?.id ?? null;
  const { inbox, unreadQuery, changeState, refresh } = useActionNotifications(
    companyId,
    user.id,
    500,
  );
  const view = Route.useSearch().view ?? "action";
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const rows = useMemo(() => inbox.data ?? [], [inbox.data]);

  const filtered = useMemo(
    () => filterActionNotifications(rows, { view, category, search }),
    [rows, view, category, search],
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
  const onCategory = (next: string) => {
    setCategory(next);
    setPage(0);
    setSelected([]);
  };

  async function bulkState(action: "read" | "archive") {
    if (!selected.length || bulkBusy) return;
    setBulkBusy(true);
    setBulkError(null);
    try {
      for (const id of selected) {
        const { data, error } = await supabase.rpc(
          "set_action_notification_state" as never,
          {
            _notification_id: id,
            _mark_read: action === "read" ? true : null,
            _archive: action === "archive" ? true : null,
          } as never,
        );
        if (error) throw error;
        if (!data) throw new Error("An alert is no longer available");
      }
      setSelected([]);
      await refresh();
      notify.success(action === "read" ? "Notifications marked as read" : "Notifications archived");
    } catch (e) {
      setBulkError(e instanceof Error ? e.message : "Some notifications could not be updated");
      await refresh();
    } finally {
      setBulkBusy(false);
    }
  }
  const toggleSelection = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));

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
      <div className="flex flex-wrap gap-2" role="group" aria-label="Notification views">
        {VIEWS.map((item) => (
          <Button
            key={item.key}
            size="sm"
            variant={view === item.key ? "default" : "outline"}
            asChild
          >
            <Link to="/notifications" search={{ view: item.key }} onClick={onViewNavigate}>
              {item.label}
            </Link>
          </Button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_230px]">
        <Input
          aria-label="Search notifications"
          placeholder="Search actions, invoices, bills…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
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
      </div>
      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
          <span>{selected.length} selected</span>
          <Button size="sm" disabled={bulkBusy} onClick={() => void bulkState("read")}>
            Mark selected read
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={bulkBusy}
            onClick={() => void bulkState("archive")}
          >
            Archive selected
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
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
      ) : inbox.isError ? (
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
        <div className="rounded-lg border px-6 py-12 text-center text-muted-foreground">
          No matching notifications
        </div>
      ) : (
        <div className="space-y-2">
          {pageRows.map((n) => (
            <NotificationRow
              key={n.id}
              item={n}
              selected={selected.includes(n.id)}
              onSelect={() => toggleSelection(n.id)}
              busy={changeState.isPending}
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
          {rows.length === 500 && (
            <p className="text-xs text-muted-foreground">
              Showing the most recent 500 notifications. Archive older actions to keep this view
              focused.
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
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onSelect}
          className="mt-1"
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
            <span className="rounded bg-muted px-2 py-0.5 text-[11px] font-medium uppercase">
              {n.priority}
            </span>
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
