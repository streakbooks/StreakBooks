import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useCanDo } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import type { JournalQualityFinding } from "@/lib/accountant/journal-quality";
import {
  listAccountantExceptionEvents,
  saveAccountantExceptionReview,
  type AccountantExceptionReview,
} from "@/lib/accountant/exception-reviews.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

export function JournalExceptionReviewDetails({
  companyId,
  finding,
  record,
}: {
  companyId: string;
  finding: JournalQualityFinding;
  record: AccountantExceptionReview | undefined;
}) {
  const canManage = useCanDo("accounting.post");
  const [note, setNote] = useState(record?.note ?? "");
  const [showHistory, setShowHistory] = useState(false);
  const qc = useQueryClient();
  const save = useServerFn(saveAccountantExceptionReview);
  const loadHistory = useServerFn(listAccountantExceptionEvents);
  const history = useQuery({
    queryKey: ["accountant-exception-events", companyId, record?.id],
    enabled: showHistory && Boolean(record),
    queryFn: () => loadHistory({ data: { companyId, reviewId: record!.id } }),
  });
  const mutation = useMutation({
    mutationFn: (action: "investigate" | "submit" | "approve" | "reopen") =>
      save({
        data: {
          companyId,
          journalId: finding.journalId,
          findingKey: finding.id,
          action,
          note,
          version: record?.version ?? null,
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["accountant-exception-reviews", companyId] });
      await qc.invalidateQueries({ queryKey: ["accountant-exception-events", companyId] });
      toast.success("Exception investigation updated");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const status = record?.status ?? "untracked";
  return (
    <div className="mt-4 space-y-3 rounded-lg border p-4" aria-label="Journal exception disposition">
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-sm">Journal #{finding.journalNumber}: {finding.kind}</strong>
        <Badge variant="outline">
          {status === "untracked"
            ? "Not investigated"
            : status === "investigating"
              ? "Investigation open"
              : status === "ready_for_review"
                ? "Awaiting independent review"
                : "Independently reviewed"}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        {finding.reason} This review documents the finding; it does not approve, reverse or alter
        any posted journal entry.
      </p>
      {canManage ? (
        <>
          <label className="block space-y-1 text-sm">
            Investigation evidence and conclusion
            <Textarea
              aria-label="Journal exception review note"
              value={note}
              maxLength={2000}
              rows={3}
              disabled={mutation.isPending}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {status === "untracked" || status === "investigating" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate("investigate")}
              >
                {status === "untracked" ? "Start investigation" : "Save investigation note"}
              </Button>
            ) : null}
            {status === "investigating" ? (
              <Button
                size="sm"
                disabled={mutation.isPending || note.trim().length < 3}
                onClick={() => mutation.mutate("submit")}
              >
                Submit for independent review
              </Button>
            ) : null}
            {status === "ready_for_review" ? (
              <Button
                size="sm"
                disabled={mutation.isPending || note.trim().length < 3}
                onClick={() => mutation.mutate("approve")}
              >
                Approve investigation review
              </Button>
            ) : null}
            {status === "ready_for_review" || status === "reviewed" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={mutation.isPending || note.trim().length < 3}
                onClick={() => mutation.mutate("reopen")}
              >
                Reopen with reason
              </Button>
            ) : null}
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          You can view accountant investigations but cannot change their status.
        </p>
      )}
      {record ? (
        <>
          <p className="text-xs text-muted-foreground">
            Version {record.version} · Prepared by {record.prepared_by?.slice(0, 8) ?? "pending"}
            · Reviewed by {record.reviewed_by?.slice(0, 8) ?? "pending"}
          </p>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowHistory((current) => !current)}
          >
            {showHistory ? "Hide review history" : "View immutable review history"}
          </Button>
          {showHistory ? (
            history.isPending ? (
              <p className="text-xs text-muted-foreground">Loading review history…</p>
            ) : history.isError ? (
              <p role="alert" className="text-xs text-destructive">
                {friendlyAuthError(history.error)}
              </p>
            ) : (
              <ul className="space-y-2 text-xs">
                {history.data?.map((event) => (
                  <li key={event.id} className="rounded-md border p-2">
                    {event.created_at} · {event.action} · {event.actor_id.slice(0, 8)}…
                    <p className="whitespace-pre-wrap">{event.note}</p>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </>
      ) : null}
    </div>
  );
}
