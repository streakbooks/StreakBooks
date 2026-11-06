import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getTaxGlReview, saveTaxGlReview, type TaxGlReviewStatus,
} from "@/lib/tax/tax-return.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { hasConcurrentTaxReviewChange } from "@/lib/tax/tax-gl-review-state";
import { useCanDo } from "@/hooks/use-can";
import { useFormat } from "@/hooks/use-format";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState, LoadingState } from "@/components/common/states";

type Assignment = "keep" | "mine" | "clear";

/** Review state is separate from statutory filing and never posts a journal. */
export function TaxGlReviewPanel({
  companyId, periodStart, periodEnd, basis, outputAccountId, inputAccountId, snapshot,
}: {
  companyId: string;
  periodStart: string;
  periodEnd: string;
  basis: "cash" | "accrual";
  outputAccountId: string;
  inputAccountId: string;
  snapshot: string;
}) {
  const canEdit = useCanDo("tax.settings");
  const f = useFormat();
  const qc = useQueryClient();
  const fetchReview = useServerFn(getTaxGlReview);
  const saveReview = useServerFn(saveTaxGlReview);
  const key = [
    "tax-gl-review", companyId, periodStart, periodEnd, basis,
    outputAccountId, inputAccountId,
  ];
  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchReview({
      data: { companyId, periodStart, periodEnd, basis, outputAccountId, inputAccountId },
    }),
  });

  const [status, setStatus] = useState<TaxGlReviewStatus>("open");
  const [note, setNote] = useState("");
  const [assignment, setAssignment] = useState<Assignment>("keep");
  const [edited, setEdited] = useState(false);
  const [editingVersion, setEditingVersion] = useState<number | null>(null);

  const record = query.data?.review;
  const currentVersion = record?.version ?? null;
  const concurrentChange = hasConcurrentTaxReviewChange(edited, editingVersion, currentVersion);
  const beginEdit = () => {
    if (!edited) setEditingVersion(currentVersion);
    setEdited(true);
  };
  // Background refreshes may update record while the user is typing.
  // Keep their draft unchanged and detect any version conflict instead.
  useEffect(() => {
    if (edited) return;
    setStatus(record?.status ?? "open");
    setNote(record?.review_note ?? "");
    setAssignment("keep");
    setEditingVersion(null);
  }, [record?.id, record?.version, record?.status, record?.review_note, edited]);

  const savedSnapshotChanged = Boolean(record && record.comparison_snapshot !== snapshot);
  const mutation = useMutation({
    mutationFn: () => saveReview({
      data: {
        companyId, periodStart, periodEnd, basis, outputAccountId, inputAccountId,
        status, reviewNote: note, reviewerAssignment: assignment,
        expectedVersion: editingVersion,
        expectedSnapshot: snapshot,
      },
    }),
    onSuccess: async () => {
      setEdited(false);
      setEditingVersion(null);
      await qc.invalidateQueries({ queryKey: key });
      toast.success("Tax GL review saved with audit history");
    },
    onError: (err) => {
      toast.error(friendlyAuthError(err));
      void qc.invalidateQueries({ queryKey: key });
    },
  });

  if (query.isPending) return <LoadingState />;
  if (query.isError) return (
    <ErrorState title="Could not load tax GL review" description={friendlyAuthError(query.error)}
      onRetry={() => void query.refetch()} />
  );
  if (!query.data?.available) return (
    <Alert>
      <AlertTitle>Review workflow not yet available</AlertTitle>
      <AlertDescription>
        Apply the reviewed Tax GL review database migration to staging and verify it
        before enabling reviewer notes and status changes.
      </AlertDescription>
    </Alert>
  );

  const canSave = canEdit && edited && !concurrentChange && !mutation.isPending &&
    (status !== "resolved" || (basis === "accrual" && note.trim().length >= 10 &&
      !(record?.status === "resolved" && savedSnapshotChanged)));
  return (
    <div className="space-y-4 rounded-md border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Reconciliation review and audit trail</p>
          <p className="text-xs text-muted-foreground">
            Reviewer decisions are versioned. This is an internal review, not a tax filing.
          </p>
        </div>
        <Badge variant={savedSnapshotChanged ? "destructive" : record?.status === "resolved" ? "default" : "outline"}>
          {savedSnapshotChanged ? "Stale review evidence" :
            record?.status === "resolved" ? "Review marked resolved" :
            record?.status === "in_review" ? "In review" : "Open / not reviewed"}
        </Badge>
      </div>

      {concurrentChange ? (
        <Alert variant="destructive">
          <AlertTitle>Another reviewer updated this review</AlertTitle>
          <AlertDescription>
            Your unsaved notes are preserved. This draft cannot overwrite the newer review.
            Copy any notes you need, then discard this draft to reload the latest version.
          </AlertDescription>
        </Alert>
      ) : null}

      {savedSnapshotChanged ? (
        <Alert variant="destructive">
          <AlertTitle>Review requires refresh</AlertTitle>
          <AlertDescription>
            The current GL comparison differs from the snapshot previously reviewed.
            Change the review status to In review, document the new evidence, save,
            then resolve in a separate review action.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="tax-review-status">Review status</Label>
          <Select value={status} disabled={!canEdit || mutation.isPending}
            onValueChange={(v) => { beginEdit(); setStatus(v as TaxGlReviewStatus); }}>
            <SelectTrigger id="tax-review-status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_review">In review</SelectItem>
              <SelectItem value="resolved" disabled={basis === "cash" || (record?.status === "resolved" && savedSnapshotChanged)}>Resolved (internal)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="tax-review-assignee">Reviewer assignment</Label>
          <Select value={assignment} disabled={!canEdit || mutation.isPending}
            onValueChange={(v) => { beginEdit(); setAssignment(v as Assignment); }}>
            <SelectTrigger id="tax-review-assignee"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="keep">Keep assigned reviewer</SelectItem>
              <SelectItem value="mine">Assign to me</SelectItem>
              <SelectItem value="clear">Unassigned</SelectItem>
            </SelectContent>
          </Select>
          {record?.reviewer_id ? (
            <p className="text-xs text-muted-foreground">
              Current reviewer ID: {record.reviewer_id}
            </p>
          ) : null}
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="tax-review-note">Reviewer note / discrepancy explanation</Label>
        <Textarea
          id="tax-review-note" rows={3} maxLength={4000}
          disabled={!canEdit || mutation.isPending}
          value={note}
          onChange={(e) => { beginEdit(); setNote(e.target.value); }}
          placeholder="Describe the affected journal, expected tax treatment and steps taken"
        />
        <p className="text-xs text-muted-foreground">
          Resolving requires at least 10 characters of explanation and an accrual-basis review.
          A resolved review can become stale if underlying figures change.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" disabled={!canSave} onClick={() => mutation.mutate()}>
          {mutation.isPending ? "Saving…" : "Save review"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
          Refresh review
        </Button>
        {edited ? (
          <Button size="sm" variant="ghost" disabled={mutation.isPending} onClick={() => {
            setEdited(false);
            setEditingVersion(null);
            void query.refetch();
          }}>
            Discard unsaved changes
          </Button>
        ) : null}
        {record ? <span className="text-xs text-muted-foreground">
          Version {record.version} · updated {f.dateTime(record.updated_at)}
        </span> : null}
        {!canEdit ? <Badge variant="outline">View only</Badge> : null}
      </div>
      <div className="space-y-2">
        <p className="text-sm font-semibold">Change history</p>
        {query.data.events.length === 0 ? (
          <p className="text-xs text-muted-foreground">No review changes recorded yet.</p>
        ) : (
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {query.data.events.map((event) => (
              <div key={event.id} className="rounded border p-2 text-xs">
                <p className="font-medium">
                  Version {event.version} · {event.event_type} · {event.new_status} · {f.dateTime(event.created_at)}
                </p>
                <p className="text-muted-foreground">
                  Actor: {event.actor_user_id ?? "Former user"} ·
                  Reviewer: {event.new_reviewer_id ?? "Unassigned"}
                </p>
                {event.review_note ? <p className="whitespace-pre-wrap">{event.review_note}</p> : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
