import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useState } from "react";
import { Link, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardList, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useCanDo } from "@/hooks/use-can";
import { buildAiReviewAuditCsv } from "@/lib/ai/review-audit-csv";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  listAiJournalReviewCases,
  getAiJournalReviewCase,
  exportAiJournalReviewAudit,
  listAiJournalReviewEvents,
  listAiJournalReviewerCandidates,
  saveAiJournalReview,
  type AiJournalReviewCase,
} from "@/lib/ai/review-queue.functions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const PAGE_SIZE = 25;
type ReviewStatus = "all" | "open" | "assigned" | "reviewed" | "reopened";
const STATUS_LABEL: Record<ReviewStatus, string> = {
  all: "All statuses",
  open: "Open",
  assigned: "Assigned",
  reviewed: "Review signed off",
  reopened: "Reopened",
};

function DateStamp({ value }: { value: string }) {
  return (
    <span className="text-xs text-muted-foreground">{value.slice(0, 16).replace("T", " ")}</span>
  );
}

/**
 * Persistent, version-checked human AI-evidence queue. Sign-off is NOT journal
 * authorisation or posting, and it does not alter accountant exception reviews.
 */
export function AiJournalReviewQueue({
  companyId,
  canUse,
  canViewReports,
  canManage,
  canViewMembers,
}: {
  companyId: string;
  canUse: boolean;
  canViewReports: boolean;
  canManage: boolean;
  canViewMembers: boolean;
}) {
  const { reviewCase } = useSearch({ from: "/_authenticated/ai-assistant" });
  const canAccountant = useCanDo("accounting.view");
  const canExportAudit = useCanDo("reports.export");
  const listCases = useServerFn(listAiJournalReviewCases);
  const fetchCase = useServerFn(getAiJournalReviewCase);
  const fetchAudit = useServerFn(exportAiJournalReviewAudit);
  const listEvents = useServerFn(listAiJournalReviewEvents);
  const listReviewers = useServerFn(listAiJournalReviewerCandidates);
  const save = useServerFn(saveAiJournalReview);
  const client = useQueryClient();

  const [status, setStatus] = useState<ReviewStatus>("all");
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(reviewCase ?? null);
  const [note, setNote] = useState("");
  const [assignee, setAssignee] = useState("");

  const canRead = canUse && canViewReports;
  const canAssign = canManage && canViewMembers;

  const casesQ = useQuery({
    queryKey: ["ai-journal-review-cases", companyId, page, status, mine],
    enabled: canRead,
    queryFn: () => listCases({ data: { companyId, page, status, assignedToMe: mine } }),
  });
  const selectedFromPage = casesQ.data?.rows.find((item) => item.id === selectedId) ?? null;
  const caseQ = useQuery({
    queryKey: ["ai-journal-review-by-id", companyId, selectedId],
    enabled: canRead && Boolean(selectedId) && !selectedFromPage,
    queryFn: () => {
      if (!selectedId) throw new Error("Choose a review case.");
      return fetchCase({ data: { companyId, caseId: selectedId } });
    },
  });
  const selected = selectedFromPage ?? caseQ.data ?? null;
  const eventsQ = useQuery({
    queryKey: ["ai-journal-review-events", companyId, selectedId],
    enabled: canRead && Boolean(selectedId),
    queryFn: () => {
      if (!selectedId) throw new Error("Choose a review case.");
      return listEvents({ data: { companyId, caseId: selectedId } });
    },
  });
  const reviewersQ = useQuery({
    queryKey: ["ai-journal-reviewers", companyId],
    enabled: canRead && canAssign,
    queryFn: () => listReviewers({ data: { companyId } }),
    staleTime: 60_000,
  });
  const auditM = useMutation({
    mutationFn: (caseId: string) => fetchAudit({ data: { companyId, caseId } }),
    onSuccess: (result) => {
      const csv = buildAiReviewAuditCsv(result);
      const url = URL.createObjectURL(
        new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "linkbooks-ai-journal-review-" + result.review.id.slice(0, 8) + ".csv";
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("Complete AI review history exported; no accounting records were changed.");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const mutate = useMutation({
    mutationFn: ({
      item,
      action,
      comment,
      reviewer,
    }: {
      item: AiJournalReviewCase;
      action: "assign" | "comment" | "sign_off" | "reopen";
      comment: string;
      reviewer: string | null;
    }) =>
      save({
        data: {
          companyId,
          journalId: item.journal_id,
          caseId: item.id,
          expectedVersion: item.version,
          action,
          assignedTo: reviewer,
          note: comment,
        },
      }),
    onSuccess: async () => {
      setPage(0);
      setNote("");
      setAssignee("");
      toast.success("AI review queue updated; no accounting entry was changed.");
      await Promise.all([
        client.invalidateQueries({ queryKey: ["ai-journal-review-cases", companyId] }),
        client.invalidateQueries({ queryKey: ["ai-journal-review-events", companyId] }),
        client.invalidateQueries({ queryKey: ["ai-journal-review-by-id", companyId] }),
      ]);
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (!canUse) return null;

  const submit = (action: "assign" | "comment" | "sign_off" | "reopen") => {
    if (!selected || mutate.isPending) return;
    if (action === "assign" && !assignee) {
      toast.error("Choose an active colleague to review this journal.");
      return;
    }
    if ((action === "sign_off" || action === "reopen") && note.trim().length < 10) {
      toast.error("Enter at least 10 characters explaining your decision.");
      return;
    }
    if (action === "comment" && note.trim().length < 2) {
      toast.error("Enter a comment of at least two characters.");
      return;
    }
    if (
      action === "sign_off" &&
      !window.confirm(
        "Record your independent AI review sign-off? This does NOT authorise or post the journal.",
      )
    )
      return;
    mutate.mutate({
      item: selected,
      action,
      comment: note.trim(),
      reviewer: action === "assign" ? assignee : null,
    });
  };

  return (
    <Card className="mt-5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList className="size-4" /> AI accounting review queue
          <Badge variant="secondary">Persistent · human-reviewed</Badge>
        </CardTitle>
        <CardDescription>
          Track the review of posted-journal evidence across your organisation. Reviewers, comments,
          decisions and changes are retained with an audit trail. This is separate from journal
          posting, accountant approvals and period locking.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!canViewReports ? (
          <Alert>
            <ShieldCheck className="size-4" />
            <AlertTitle>Reports View access required</AlertTitle>
            <AlertDescription>
              AI reviews of journal evidence require both AI and reporting permissions.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor="ai-review-status">Status</Label>
                <RecordLookupSelect
                  id="ai-review-status"
                  className="flex h-10 w-44 rounded-md border border-input bg-background px-3 text-sm"
                  value={status}
                  onValueChange={(e) => {
                    setStatus(e as ReviewStatus);
                    setPage(0);
                    setSelectedId(null);
                  }}
                >
                  {Object.entries(STATUS_LABEL).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </RecordLookupSelect>
              </div>
              <div className="flex items-center gap-2 pb-2">
                <Checkbox
                  id="ai-review-mine"
                  checked={mine}
                  onCheckedChange={(value) => {
                    setMine(value === true);
                    setPage(0);
                    setSelectedId(null);
                  }}
                />
                <Label htmlFor="ai-review-mine" className="font-normal">
                  Assigned to me
                </Label>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={casesQ.isFetching}
                onClick={() =>
                  void client.invalidateQueries({
                    queryKey: ["ai-journal-review-cases", companyId],
                  })
                }
              >
                <RefreshCw className="size-4" /> Refresh
              </Button>
            </div>
            {casesQ.isPending ? (
              <p role="status" className="text-sm text-muted-foreground">
                Loading persistent AI reviews…
              </p>
            ) : casesQ.isError ? (
              <Alert variant="destructive">
                <AlertTitle>AI review queue unavailable</AlertTitle>
                <AlertDescription>
                  {friendlyAuthError(casesQ.error)}{" "}
                  <Button variant="outline" size="sm" onClick={() => void casesQ.refetch()}>
                    Retry
                  </Button>
                </AlertDescription>
              </Alert>
            ) : casesQ.data ? (
              <>
                <p className="text-xs text-muted-foreground">
                  {casesQ.data.total} matching review case(s); {casesQ.data.rows.length} on this
                  page. Create a case from a posted journal's <strong>Add to review queue</strong>{" "}
                  action in the evidence explorer above.
                </p>
                {casesQ.data.rows.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
                    No review cases match the selected filter.
                  </p>
                ) : (
                  <div className="grid gap-2">
                    {casesQ.data.rows.map((item) => (
                      <div
                        key={item.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge status={item.status} label={STATUS_LABEL[item.status]} />
                            {item.is_assigned_to_me ? (
                              <Badge variant="outline">Assigned to you</Badge>
                            ) : null}
                            {item.is_my_case ? (
                              <Badge variant="outline">You prepared this</Badge>
                            ) : null}
                          </div>
                          <Link
                            to="/accounting"
                            search={{ tab: "journals", journal: item.journal_id }}
                            className="block break-all text-sm font-medium text-primary underline-offset-2 hover:underline"
                          >
                            Open linked journal
                          </Link>
                          <DateStamp value={item.updated_at} />
                        </div>
                        <Button
                          size="sm"
                          variant={selectedId === item.id ? "default" : "outline"}
                          onClick={() => {
                            setSelectedId(selectedId === item.id ? null : item.id);
                            setNote("");
                            setAssignee(item.assigned_to ?? "");
                          }}
                        >
                          {selectedId === item.id ? "Close case" : "Review case"}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">
                    Page {page + 1} of {Math.max(1, Math.ceil(casesQ.data.total / PAGE_SIZE))}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === 0 || casesQ.isFetching}
                      onClick={() => {
                        setPage((v) => Math.max(0, v - 1));
                        setSelectedId(null);
                      }}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={(page + 1) * PAGE_SIZE >= casesQ.data.total || casesQ.isFetching}
                      onClick={() => {
                        setPage((v) => v + 1);
                        setSelectedId(null);
                      }}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </>
            ) : null}
            {caseQ.isError ? (
              <Alert variant="destructive">
                <AlertTitle>Requested AI review case unavailable</AlertTitle>
                <AlertDescription>
                  {friendlyAuthError(caseQ.error)}{" "}
                  <Button size="sm" variant="outline" onClick={() => void caseQ.refetch()}>
                    Retry
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}
            {selected ? (
              <div className="space-y-4 rounded-lg border p-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold">Journal review case</h3>
                    <p className="text-xs text-muted-foreground">
                      Version {selected.version} · {STATUS_LABEL[selected.status]}
                    </p>
                    {selected.reviewed_by ? (
                      <p className="text-xs text-muted-foreground">
                        Signed off by {selected.reviewed_by.slice(0, 8)} on{" "}
                        {selected.reviewed_at?.slice(0, 16)}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">AI evidence review only</Badge>
                    {canExportAudit ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={auditM.isPending}
                        onClick={() => auditM.mutate(selected.id)}
                      >
                        {auditM.isPending ? "Preparing CSV…" : "Export complete audit CSV"}
                      </Button>
                    ) : null}
                    {canAccountant ? (
                      <Button variant="outline" size="sm" asChild>
                        <Link to="/accountant" search={{ tab: "workpapers" }}>
                          Open Accountant Workpapers
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                </div>
                {canAssign && selected.status !== "reviewed" ? (
                  <div className="space-y-2">
                    <Label htmlFor="ai-review-assignee">Assign independent reviewer</Label>
                    <RecordLookupSelect
                      id="ai-review-assignee"
                      className="flex h-10 w-full max-w-md rounded-md border border-input bg-background px-3 text-sm"
                      value={assignee}
                      disabled={mutate.isPending || reviewersQ.isPending}
                      onValueChange={(e) => setAssignee(e)}
                    >
                      <option value="">Choose active colleague</option>
                      {(reviewersQ.data ?? [])
                        .filter((r) => r.user_id !== selected.created_by)
                        .map((r) => (
                          <option key={r.user_id} value={r.user_id}>
                            {r.label} · {r.role}
                          </option>
                        ))}
                    </RecordLookupSelect>
                    {reviewersQ.isError ? (
                      <p className="text-xs text-destructive">
                        {friendlyAuthError(reviewersQ.error)}
                      </p>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!assignee || mutate.isPending}
                      onClick={() => submit("assign")}
                    >
                      Assign reviewer
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      The database checks active membership and effective reviewer permission. A
                      creator cannot review their own case.
                    </p>
                  </div>
                ) : null}

                <div className="space-y-2">
                  <Label htmlFor="ai-review-note">Comment or decision reason</Label>
                  <Textarea
                    id="ai-review-note"
                    value={note}
                    maxLength={2000}
                    rows={3}
                    disabled={mutate.isPending}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Record the evidence checked, outstanding questions and any reason for reviewer sign-off…"
                  />
                  <p className="text-xs text-muted-foreground">{note.length}/2000 characters</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={mutate.isPending || note.trim().length < 2}
                      onClick={() => submit("comment")}
                    >
                      Add comment
                    </Button>
                    {selected.status !== "reviewed" &&
                    canManage &&
                    selected.is_assigned_to_me &&
                    !selected.is_my_case ? (
                      <Button
                        type="button"
                        size="sm"
                        disabled={mutate.isPending || note.trim().length < 10}
                        onClick={() => submit("sign_off")}
                      >
                        Sign off AI review
                      </Button>
                    ) : null}
                    {selected.status === "reviewed" && canManage ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={mutate.isPending || note.trim().length < 10}
                        onClick={() => submit("reopen")}
                      >
                        Reopen review
                      </Button>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Sign-off acknowledges an evidence review, not the accuracy of every ledger
                    posting and not the authorisation of an accounting entry. Posting and accountant
                    exceptions retain their existing permissions, workflows and audit trail.
                  </p>
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Review event history</h4>
                  {eventsQ.isPending ? (
                    <p className="text-xs text-muted-foreground">Loading review events…</p>
                  ) : eventsQ.isError ? (
                    <Alert variant="destructive">
                      <AlertTitle>Event history unavailable</AlertTitle>
                      <AlertDescription>{friendlyAuthError(eventsQ.error)}</AlertDescription>
                    </Alert>
                  ) : eventsQ.data?.length ? (
                    <div className="max-h-80 space-y-2 overflow-y-auto">
                      {eventsQ.data.map((event) => (
                        <div
                          key={event.id}
                          className="space-y-1 rounded-md bg-muted/40 p-3 text-xs"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">{event.action.replaceAll("_", " ")}</Badge>
                            <DateStamp value={event.created_at} />
                            <span className="text-muted-foreground">
                              By {event.actor_id.slice(0, 8)}
                            </span>
                          </div>
                          {event.note ? (
                            <p className="whitespace-pre-wrap break-words">{event.note}</p>
                          ) : null}
                          {event.previous_status ? (
                            <p className="text-muted-foreground">
                              {event.previous_status} → {event.new_status}
                            </p>
                          ) : null}
                        </div>
                      ))}
                      {eventsQ.data.length === 100 ? (
                        <p className="text-xs text-muted-foreground">
                          Showing the latest 100 events only.
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No events recorded.</p>
                  )}
                </div>
              </div>
            ) : null}
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              Read and write actions are checked against your current company permissions on the
              server and in the database. Review records persist; no underlying journal or formal
              posting/approval status is changed by this queue.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
