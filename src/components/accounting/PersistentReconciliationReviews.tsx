import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCanDo } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import type { ExceptionFinding } from "@/lib/accounting/reconciliation-exceptions";
import {
  listReconciliationReviewAssignees,
  listReconciliationReviewCases,
  getReconciliationReviewCase,
  saveReconciliationReviewCase,
  type SaveCaseInput,
} from "@/lib/accounting/reconciliation-review.functions";
import {
  reconciliationFindingFingerprint,
  type ReconciliationCaseAction, type ReconciliationCaseStatus,
} from "@/lib/accounting/reconciliation-review";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Durable review tracking is separate from local "reviewed this session" ticks.
 * It never changes an audit result, posts a journal, or marks a case resolved.
 */
export function PersistentReconciliationReviews({
  companyId, findings,
}: {
  companyId: string; findings: readonly ExceptionFinding[];
}) {
  const canManage = useCanDo("accounting.post");
  const fetchQueue = useServerFn(listReconciliationReviewCases);
  const fetchPeople = useServerFn(listReconciliationReviewAssignees);
  const fetchOne = useServerFn(getReconciliationReviewCase);
  const submit = useServerFn(saveReconciliationReviewCase);
  const queue = useMutation({
    mutationFn: () => fetchQueue({ data: { companyId } }),
  });
  const people = useMutation({
    mutationFn: () => fetchPeople({ data: { companyId } }),
  });
  const lookup = useMutation({
    mutationFn: (key: { source: ExceptionFinding["source"]; fingerprint: string }) =>
      fetchOne({ data: { companyId, source: key.source, fingerprint: key.fingerprint } }),
  });
  const save = useMutation({
    mutationFn: (input: SaveCaseInput) => submit({ data: input }),
    onSuccess: async () => {
      await queue.mutateAsync();
      if (selectedKey) {
        const row = activeFindings.find(x => x.fingerprint === selectedKey);
        if (row) await lookup.mutateAsync({ source: row.row.source, fingerprint: row.fingerprint });
      }
    },
  });
  const [selectedKey, setSelectedKey] = useState("");
  const [selectedSavedId, setSelectedSavedId] = useState("");
  const [action, setAction] = useState<"assign" | "comment" | "status">("comment");
  const [nextStatus, setNextStatus] = useState<ReconciliationCaseStatus>("in_review");
  const [assignedTo, setAssignedTo] = useState("");
  const [note, setNote] = useState("");
  const [lastError, setLastError] = useState("");
  const activeFindings = useMemo(() => findings.map(row => ({
    row, fingerprint: reconciliationFindingFingerprint(row),
  })), [findings]);
  const chosen = activeFindings.find(x => x.fingerprint === selectedKey);
  const matchingSaved = queue.data?.cases.find(row =>
    chosen && row.source_type === chosen.row.source &&
    row.finding_fingerprint === chosen.fingerprint) ??
    (chosen && lookup.data && lookup.data.source_type === chosen.row.source &&
      lookup.data.finding_fingerprint === chosen.fingerprint ? lookup.data : undefined);
  const selectedSaved = matchingSaved ??
    queue.data?.cases.find(x => x.id === selectedSavedId);
  const busy = queue.isPending || people.isPending || save.isPending || lookup.isPending;
  const refresh = () => { setLastError(""); queue.mutate(); };
  const performOpen = async () => {
    if (!chosen || !canManage || busy) return;
    setLastError("");
    try {
      await save.mutateAsync({
        companyId, source: chosen.row.source, fingerprint: chosen.fingerprint,
        action: "open", finding: {
          title: chosen.row.title,
          detail: chosen.row.detail.slice(0, 2000),
          severity: chosen.row.severity,
          reference: chosen.row.reference?.slice(0, 180) ?? null,
          journalId: chosen.row.journalId,
        }, note: note.trim(),
      });
      setNote("");
    } catch (error) { setLastError(friendlyAuthError(error)); }
  };
  const performUpdate = async () => {
    if (!selectedSaved || !canManage || busy) return;
    setLastError("");
    if (action === "assign" && !UUID.test(assignedTo)) {
      setLastError("Select or enter an active organisation member UUID.");
      return;
    }
    try {
      await save.mutateAsync({
        companyId, source: selectedSaved.source_type,
        fingerprint: selectedSaved.finding_fingerprint,
        action: action as ReconciliationCaseAction,
        expectedVersion: selectedSaved.version,
        assignedTo: action === "assign" ? assignedTo : null,
        status: action === "status" ? nextStatus : null,
        note: note.trim(),
      });
      setNote("");
    } catch (error) { setLastError(friendlyAuthError(error)); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Persistent reconciliation review cases</CardTitle>
        <CardDescription>
          Save and assign exception investigations across sessions. Open, In review and
          Blocked are operational statuses, not verified resolution or accounting approval.
          This queue is separate from the session-only review checkboxes above.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2 items-center">
          <Button type="button" variant="outline" disabled={busy} onClick={refresh}>
            {queue.isPending ? "Loading saved cases…" : "Load saved review cases"}
          </Button>
          {queue.data ? (
            <span className="text-xs text-muted-foreground">
              Showing {queue.data.cases.length} saved case(s)
              {queue.data.hasMore ? " · more than 100 exist; queue is sampled" : ""}
            </span>
          ) : null}
        </div>
        {queue.isError ? (
          <p role="alert" className="text-sm text-destructive">
            Saved cases unavailable: {friendlyAuthError(queue.error)}.
            Ensure the reconciliation review migration is applied.
          </p>
        ) : null}
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="exc-track-current">Select an audited exception</Label>
            <select id="exc-track-current" className="w-full rounded-md border bg-background p-2 text-sm"
              value={selectedKey}
              onChange={e => {
                const key = e.target.value;
                setSelectedKey(key); setSelectedSavedId(""); setNote(""); setLastError("");
                const match = activeFindings.find(x => x.fingerprint === key);
                if (match) lookup.mutate({ source: match.row.source, fingerprint: key });
                else lookup.reset();
              }}>
              <option value="">Choose a current finding to track</option>
              {activeFindings.map(({ row, fingerprint }) => (
                <option value={fingerprint} key={row.key}>
                  {row.source} · {row.title.slice(0, 90)}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Current findings are from the audits you chose to run. A changed evidence description
              creates a new case identity; previous cases remain visible in the saved queue.
            </p>
            {chosen && lookup.isSuccess && !matchingSaved ? (
              <Button type="button" size="sm" disabled={!canManage || busy}
                onClick={() => void performOpen()}>
                Start persistent review
              </Button>
            ) : null}
            {lookup.isError ? (
              <p role="alert" className="text-xs text-destructive">
                Existing review lookup failed: {friendlyAuthError(lookup.error)}
              </p>
            ) : null}
            {!canManage ? (
              <p className="text-xs text-muted-foreground">
                Accounting posting permission is required to create or change review cases.
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="exc-saved-review">Saved cases in this organisation</Label>
            <select id="exc-saved-review" className="w-full rounded-md border bg-background p-2 text-sm"
              value={selectedSavedId}
              onChange={e => { setSelectedSavedId(e.target.value); setSelectedKey(""); setNote(""); }}>
              <option value="">Choose a saved case</option>
              {queue.data?.cases.map(row => (
                <option key={row.id} value={row.id}>
                  {row.status} · {row.source_type} · {row.title.slice(0, 75)}
                </option>
              ))}
            </select>
            {selectedSaved ? (
              <div className="space-y-1 rounded-md border p-2 text-xs">
                <p><strong>{selectedSaved.title}</strong></p>
                <p className="text-muted-foreground whitespace-pre-wrap break-words">
                  {selectedSaved.detail}
                </p>
                <p>Status: {selectedSaved.status} · Version: {selectedSaved.version}</p>
                <p className="break-all">Assigned to: {selectedSaved.assigned_to ?? "Unassigned"}</p>
                <p>Updated: {selectedSaved.updated_at}</p>
              </div>
            ) : null}
          </div>
        </div>
        {selectedSaved && canManage ? (
          <div className="space-y-3 rounded-md border p-3">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="space-y-1">
                <Label htmlFor="exc-case-action">Review action</Label>
                <select id="exc-case-action" className="rounded-md border bg-background p-2 text-sm"
                  value={action} onChange={e => setAction(e.target.value as typeof action)}>
                  <option value="comment">Add comment</option>
                  <option value="assign">Assign reviewer</option>
                  <option value="status">Change operational status</option>
                </select>
              </div>
              {action === "status" ? (
                <div className="space-y-1">
                  <Label htmlFor="exc-case-status">New status</Label>
                  <select id="exc-case-status" className="rounded-md border bg-background p-2 text-sm"
                    value={nextStatus}
                    onChange={e => setNextStatus(e.target.value as ReconciliationCaseStatus)}>
                    <option value="open">Open</option>
                    <option value="in_review">In review</option>
                    <option value="blocked">Blocked</option>
                  </select>
                </div>
              ) : null}
            </div>
            {action === "assign" ? (
              <div className="space-y-2">
                <Label htmlFor="exc-case-assignee">Reviewer user UUID</Label>
                <Input id="exc-case-assignee" value={assignedTo} placeholder="Active organisation member UUID"
                  onChange={e => setAssignedTo(e.target.value.trim())}/>
                <Button type="button" size="sm" variant="outline" disabled={busy}
                  onClick={() => people.mutate()}>
                  Load eligible organisation members
                </Button>
                {people.data ? (
                  <select aria-label="Active organisation members" value=""
                    className="w-full rounded-md border bg-background p-2 text-xs"
                    onChange={e => setAssignedTo(e.target.value)}>
                    <option value="">Choose an active member</option>
                    {people.data.members.map(row => (
                      <option key={row.user_id} value={row.user_id}>
                        {row.role} · {row.user_id}
                      </option>
                    ))}
                  </select>
                ) : null}
                {people.data?.hasMore ? (
                  <p className="text-xs text-muted-foreground">
                    Showing only the first 100 active members. Enter an older member UUID directly.
                  </p>
                ) : null}
                {people.isError ? (
                  <p className="text-xs text-destructive" role="alert">
                    Staff selector requires members.view: {friendlyAuthError(people.error)}
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="space-y-1">
              <Label htmlFor="exc-case-note">Review note / evidence description</Label>
              <textarea id="exc-case-note" rows={3} maxLength={2000}
                className="w-full rounded-md border bg-background p-2 text-sm"
                value={note} onChange={e => setNote(e.target.value)}
                placeholder="Explain the investigation, assignment or status change" />
            </div>
            <Button type="button" size="sm" disabled={busy ||
              (action === "comment" && note.trim().length < 2) ||
              (action === "status" && (note.trim().length < 5 ||
                nextStatus === selectedSaved.status)) ||
              (action === "assign" && !UUID.test(assignedTo))}
              onClick={() => void performUpdate()}>
              {save.isPending ? "Saving…" : "Save versioned review action"}
            </Button>
            <p className="text-xs text-muted-foreground">
              All actions require accounting.post and a current version. Concurrent changes
              are rejected; refresh the saved queue before retrying. No action resolves an
              accounting discrepancy or changes the underlying journal.
            </p>
          </div>
        ) : null}
        {lastError || save.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {lastError || friendlyAuthError(save.error)}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
