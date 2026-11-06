import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getTaxGlReview, saveTaxGlReview, type TaxGlReviewStatus,
} from "@/lib/tax/tax-return.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { useCanDo } from "@/hooks/use-can";
import { useFormat } from "@/hooks/use-format";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

  const record = query.data?.review;
  useEffect(() => {
    setStatus(record?.status ?? "open");
    setNote(record?.review_note ?? "");
    setAssignment("keep");
    setEdited(false);
  }, [record?.id, record?.version, record?.status, record?.review_note]);

  const savedSnapshotChanged = Boolean(record && record.comparison_snapshot !== snapshot);
  const mutation = useMutation({
    mutationFn: () => saveReview({
      data: {
        companyId, periodStart, periodEnd, basis, outputAccountId, inputAccountId,
        status, reviewNote: note, reviewerAssignment: assignment,
        expectedVersion: record?.version ?? null,
        expectedSnapshot: snapshot,
      },
    }),
    onSuccess: async () => {
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

  const canSave = canEdit && edited && !mutation.isPending &&
    (status !== "resolved" || (basis === "accrual" && note.trim().length >= 10));
  return (
    <div className="space-y-4 rounded-md border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Reconciliation review and audit trail</p>
          <p className="text-xs text-muted-foreground">
            Reviewer decisions are versioned. This is an internal review, not a tax filing.
          </p>
        </div>
        <Badge variant={record?.status === "resolved" ? "default" : "outline"}>
          {record?.status === "resolved" ? "Review marked resolved" :
            record?.status === "in_review" ? "In review" : "Open / not reviewed"}
        </Badge>
      </div>

      {savedSnapshotChanged ? (
        <Alert variant="destructive">
          <AlertTitle>Review requires refresh</AlertTitle>
          <AlertDescription>
            The current GL comparison differs from the snapshot previously reviewed.
            Reopen and document this change before relying on the earlier review status.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="tax-review-status">Review status</Label>
          <Select value={status} disabled={!canEdit || mutation.isPending}
            onValueChange={(v) => { setStatus(v as TaxGlReviewStatus); setEdited(true); }}>
            <SelectTrigger id="tax-review-status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_review">In review</SelectItem>
              <SelectItem value="resolved" disabled={basis === "cash"}>Resolved (internal)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="tax-review-assignee">Reviewer assignment</Label>
          <Select value={assignment} disabled={!canEdit || mutation.isPending}
            onValueChange={(v) => { setAssignment(v as Assignment); setEdited(true); }}>
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
          onChange={(e) => { setNote(e.target.value); setEdited(true); }}
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
