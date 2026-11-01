import { useState } from "react";
import { format } from "date-fns";
import {
  canTransition,
  isOverdue,
  monthEnd,
  STATUS_LABELS,
  TASK_STATUSES,
  type PracticeTask,
  type PracticeWorkspace,
} from "@/lib/accountant/practice-work";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { toCsv } from "@/lib/sales/csv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export type TaskInput = {
  companyId: string;
  payload: {
    id?: string;
    version?: number;
    title?: string;
    kind?: "deadline";
    due_date?: string;
    assignee_id?: string | null;
    note?: string;
  };
};
export type BulkInput = {
  items: Array<{ id: string; company_id: string; version: number }>;
  status: "in_progress" | "blocked" | "ready" | "completed";
  note: string;
};
export type PackInput = { companyIds: string[]; periodEnd: string; dueDate: string };
export type PackOutcome = { companyId: string; created: number; error: string | null };
export function PracticeWorkBoardView({
  workspace,
  busy,
  onSave,
  onBulk,
  onPack,
  onRefresh,
  renderAssignees,
  onNext,
  onPrevious,
}: {
  workspace: PracticeWorkspace;
  busy: boolean;
  onSave: (input: TaskInput) => Promise<unknown>;
  onBulk: (input: BulkInput) => Promise<unknown>;
  onPack: (input: PackInput) => Promise<PackOutcome[]>;
  onRefresh: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  renderAssignees?: (companyId: string) => React.ReactNode;
}) {
  const today = format(new Date(), "yyyy-MM-dd");
  const [client, setClient] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("open");
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [selection, setSelection] = useState<
    Record<string, { company_id: string; version: number }>
  >({});
  const [action, setAction] = useState<BulkInput["status"]>("in_progress");
  const [bulkNote, setBulkNote] = useState("");
  const [formClient, setFormClient] = useState(workspace.clients[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(today);
  const [assignee, setAssignee] = useState("");
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState<PracticeTask | null>(null);
  const [period, setPeriod] = useState(
    format(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1), "yyyy-MM"),
  );
  const [packDue, setPackDue] = useState(today);
  const [outcomes, setOutcomes] = useState<PackOutcome[] | null>(null);
  const [error, setError] = useState("");
  const clients = new Map(workspace.clients.map((c) => [c.id, c]));
  const visible = workspace.tasks.filter(
    (t) =>
      (!client || t.company_id === client) &&
      (status === "all" || (status === "open" ? t.status !== "completed" : t.status === status)) &&
      (!onlyOverdue || isOverdue(t, today)) &&
      `${t.title} ${clients.get(t.company_id)?.name ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const selected = Object.keys(selection)
    .map((id) => workspace.tasks.find((t) => t.id === id))
    .filter((t): t is PracticeTask => Boolean(t));
  const targets = workspace.clients.filter((c) => c.canManage && (!client || c.id === client));
  const writable = Boolean(clients.get(formClient)?.canManage);
  const clearForm = () => {
    setEditing(null);
    setTitle("");
    setNote("");
    setAssignee("");
    setDue(today);
  };
  const exportCsv = () => {
    const csv = toCsv(
      [
        "Client",
        "Task",
        "Period end",
        "Due date",
        "Status",
        "Assignee ID",
        "Preparer ID",
        "Reviewer ID",
        "Completed at",
        "Evidence note",
        "Version",
      ],
      visible.map((t) => [
        clients.get(t.company_id)?.name,
        t.title,
        t.period_end,
        t.due_date,
        STATUS_LABELS[t.status],
        t.assignee_id,
        t.prepared_by,
        t.reviewed_by,
        t.completed_at,
        t.note,
        t.version,
      ]),
    );
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "linkbooks-practice-work.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section
      aria-label="Client work console"
      className="my-6 space-y-4 rounded-xl border bg-card p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Client work & month-end review</h2>
          <p className="text-sm text-muted-foreground">
            Track deadlines, prepare evidence and obtain independent review. Completing work does
            not post entries, file returns or lock periods.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setSelection({});
              onRefresh();
            }}
          >
            Refresh work
          </Button>
          <Button variant="outline" onClick={exportCsv}>
            Export work CSV
          </Button>
        </div>
      </div>
      {workspace.hasMore && (
        <p role="alert" className="text-sm text-destructive">
          More work is available on the next page. Counts, filters and exports apply to the current
          page of up to 200 tasks.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Open work", visible.filter((t) => t.status !== "completed").length],
          ["Overdue", visible.filter((t) => isOverdue(t, today)).length],
          ["Ready for review", visible.filter((t) => t.status === "ready").length],
        ].map(([label, count]) => (
          <div key={label} className="rounded-lg border p-3">
            <p className="text-sm text-muted-foreground">{label}</p>
            <strong className="text-2xl">{count}</strong>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="text-sm">
          Client
          <select
            aria-label="Filter client work"
            className="block rounded border bg-background p-2"
            value={client}
            onChange={(e) => {
              setClient(e.target.value);
              setSelection({});
            }}
          >
            <option value="">All accessible clients</option>
            {workspace.clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Status
          <select
            aria-label="Filter work status"
            className="block rounded border bg-background p-2"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setSelection({});
            }}
          >
            <option value="open">All open work</option>
            <option value="all">All statuses</option>
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Search
          <Input
            aria-label="Search client work"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelection({});
            }}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyOverdue}
            onChange={(e) => {
              setOnlyOverdue(e.target.checked);
              setSelection({});
            }}
          />
          Overdue only
        </label>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="p-2">
                <input
                  type="checkbox"
                  aria-label="Select visible work"
                  disabled={busy || !visible.some((t) => clients.get(t.company_id)?.canManage)}
                  checked={
                    visible.length > 0 &&
                    visible
                      .filter((t) => clients.get(t.company_id)?.canManage)
                      .every((t) => Boolean(selection[t.id]))
                  }
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setSelection(
                      checked
                        ? Object.fromEntries(
                            visible
                              .filter((t) => clients.get(t.company_id)?.canManage)
                              .slice(0, 100)
                              .map((t) => [t.id, { company_id: t.company_id, version: t.version }]),
                          )
                        : {},
                    );
                  }}
                />
              </th>
              <th>Client / work</th>
              <th>Period</th>
              <th>Due</th>
              <th>Status</th>
              <th>Evidence / owner</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((t) => (
              <tr key={t.id} className="border-b align-top">
                <td className="p-2">
                  <input
                    type="checkbox"
                    aria-label={`Select ${t.title} for ${clients.get(t.company_id)?.name}`}
                    disabled={
                      busy ||
                      !clients.get(t.company_id)?.canManage ||
                      (!selection[t.id] && selected.length >= 100)
                    }
                    checked={Boolean(selection[t.id])}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setSelection((prev) => {
                        const next = { ...prev };
                        if (checked) next[t.id] = { company_id: t.company_id, version: t.version };
                        else delete next[t.id];
                        return next;
                      });
                    }}
                  />
                </td>
                <td className="p-2">
                  <strong>{t.title}</strong>
                  <p className="text-muted-foreground">{clients.get(t.company_id)?.name}</p>
                </td>
                <td className="p-2 whitespace-nowrap">{t.period_end ?? "—"}</td>
                <td className="p-2 whitespace-nowrap">
                  {t.due_date}
                  {isOverdue(t, today) && <p className="text-destructive">Overdue</p>}
                </td>
                <td className="p-2">{STATUS_LABELS[t.status]}</td>
                <td className="max-w-xs p-2">
                  <p className="whitespace-pre-wrap break-words">{t.note || "No evidence note"}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.assignee_id ? `Assigned: ${t.assignee_id.slice(0, 8)}` : "Unassigned"}
                    {t.reviewed_by ? ` · Reviewed: ${t.reviewed_by.slice(0, 8)}` : ""}
                  </p>
                </td>
                <td className="p-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      busy ||
                      !clients.get(t.company_id)?.canManage ||
                      ["ready", "completed"].includes(t.status)
                    }
                    onClick={() => {
                      setEditing(t);
                      setFormClient(t.company_id);
                      setTitle(t.title);
                      setDue(t.due_date);
                      setAssignee(t.assignee_id ?? "");
                      setNote(t.note);
                    }}
                  >
                    Edit work
                  </Button>
                </td>
              </tr>
            ))}
            {!visible.length && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                  No work matches these filters. Create a deadline or month-end pack below.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3 text-sm">
        <Button
          variant="outline"
          disabled={busy || workspace.page === 0 || !onPrevious}
          onClick={onPrevious}
        >
          Previous work page
        </Button>
        <span>Page {workspace.page + 1} — filters, counts and export apply to this page</span>
        <Button variant="outline" disabled={busy || !workspace.hasMore || !onNext} onClick={onNext}>
          Next work page
        </Button>
      </div>
      <div className="space-y-2 rounded-lg border p-3">
        <p className="text-sm font-medium">
          Bulk review — {selected.length} selected (maximum 100)
        </p>
        <label className="text-sm">
          Action
          <select
            aria-label="Bulk work action"
            className="block rounded border bg-background p-2"
            disabled={busy}
            value={action}
            onChange={(e) => setAction(e.target.value as BulkInput["status"])}
          >
            <option value="in_progress">Start / reopen work</option>
            <option value="blocked">Mark blocked</option>
            <option value="ready">Submit for review</option>
            <option value="completed">Independently review & complete</option>
          </select>
        </label>
        <label className="block text-sm">
          Evidence note or reason
          <Input
            aria-label="Bulk evidence note"
            value={bulkNote}
            maxLength={4000}
            disabled={busy}
            onChange={(e) => setBulkNote(e.target.value)}
          />
        </label>
        <p className="text-xs text-muted-foreground">
          Every selected task must support this action. A reviewer cannot complete their own
          prepared work. If one task changed or access was revoked, the whole batch rolls back.
          Reopen ready/completed work before editing.
        </p>
        <Button
          disabled={
            busy ||
            !selected.length ||
            bulkNote.trim().length < 3 ||
            selected.some((t) => !canTransition(t, action, workspace.userId))
          }
          onClick={async () => {
            if (
              !window.confirm(
                `Apply ${STATUS_LABELS[action]} to ${selected.length} tasks? This updates work records only.`,
              )
            )
              return;
            setError("");
            try {
              await onBulk({
                items: Object.entries(selection).map(([id, s]) => ({ id, ...s })),
                status: action,
                note: bulkNote,
              });
              setSelection({});
              setBulkNote("");
            } catch (e) {
              setSelection({});
              setError(friendlyAuthError(e));
            }
          }}
        >
          Apply to selected work
        </Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <form
          className="space-y-3 rounded-lg border p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError("");
            try {
              await onSave({
                companyId: formClient,
                payload: {
                  ...(editing
                    ? { id: editing.id, version: editing.version }
                    : { kind: "deadline" as const }),
                  title,
                  due_date: due,
                  assignee_id: assignee || null,
                  note,
                },
              });
              clearForm();
            } catch (err) {
              setError(friendlyAuthError(err));
            }
          }}
        >
          <h3 className="font-semibold">
            {editing ? "Edit client work" : "Create client deadline"}
          </h3>
          <label className="block text-sm">
            Client
            <select
              aria-label="Work client"
              className="mt-1 block w-full rounded border bg-background p-2"
              disabled={busy || Boolean(editing)}
              required
              value={formClient}
              onChange={(e) => {
                setFormClient(e.target.value);
                setAssignee("");
              }}
            >
              <option value="">Choose client</option>
              {workspace.clients.map((c) => (
                <option key={c.id} value={c.id} disabled={!c.canManage}>
                  {c.name}
                  {c.canManage ? "" : " (view only)"}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Work title
            <Input
              aria-label="Work title"
              required
              minLength={2}
              maxLength={200}
              disabled={busy}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Due date
            <Input
              aria-label="Work due date"
              required
              type="date"
              disabled={busy}
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Assignee
            <select
              aria-label="Work assignee"
              className="mt-1 block w-full rounded border bg-background p-2"
              disabled={busy || !writable}
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
            >
              <option value="">Unassigned</option>
              {renderAssignees ? renderAssignees(formClient) : null}
            </select>
          </label>
          <label className="block text-sm">
            Evidence note
            <Input
              aria-label="Work evidence note"
              maxLength={4000}
              disabled={busy}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <Button type="submit" disabled={busy || !writable || title.trim().length < 2 || !due}>
            {editing ? "Save work" : "Create deadline"}
          </Button>
          {editing && (
            <Button type="button" variant="outline" disabled={busy} onClick={clearForm}>
              Cancel edit
            </Button>
          )}
        </form>
        <div className="space-y-3 rounded-lg border p-4">
          <h3 className="font-semibold">Generate month-end workflow</h3>
          <p className="text-sm text-muted-foreground">
            Six review tasks per client: banking, receivables, payables, adjustments, tax and
            reporting. Existing month-end tasks are preserved. Client batches report each result
            separately.
          </p>
          <label className="block text-sm">
            Accounting month
            <Input
              aria-label="Accounting month"
              type="month"
              value={period}
              disabled={busy}
              onChange={(e) => setPeriod(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Review deadline
            <Input
              aria-label="Month-end deadline"
              type="date"
              value={packDue}
              disabled={busy}
              onChange={(e) => setPackDue(e.target.value)}
            />
          </label>
          <p className="text-sm">
            Targets: {targets.length} writable{" "}
            {client ? "client" : "clients in the current client filter"}. Maximum 20 per batch.
          </p>
          <Button
            disabled={busy || !targets.length || targets.length > 20 || !period || !packDue}
            onClick={async () => {
              setError("");
              try {
                const end = monthEnd(period);
                if (packDue < end)
                  throw new Error("Review deadline must be on or after the month end");
                if (
                  !window.confirm(`Create month-end work for ${targets.length} clients for ${end}?`)
                )
                  return;
                setOutcomes(
                  await onPack({
                    companyIds: targets.map((c) => c.id),
                    periodEnd: end,
                    dueDate: packDue,
                  }),
                );
              } catch (e) {
                setError(friendlyAuthError(e));
              }
            }}
          >
            Generate month-end work
          </Button>
          {outcomes && (
            <div role="status" className="text-sm">
              {outcomes.map((o) => (
                <p key={o.companyId} className={o.error ? "text-destructive" : ""}>
                  {clients.get(o.companyId)?.name}:{" "}
                  {o.error ?? `${o.created} tasks created; existing tasks preserved`}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
