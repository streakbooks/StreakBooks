import { hasAsciiControlCharacters } from "@/lib/text-validation";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listReconciliationReviewHistory,
  progressReconciliationReviewCase,
  type ProgressReconciliationReviewInput,
} from "@/lib/accounting/reconciliation-review-signoff.functions";
import type {
  ReconciliationSavedCase,
  ReconciliationReviewAction,
} from "@/lib/accounting/reconciliation-review";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const validEvidenceUrl = (url: string): boolean =>
  /^https:\/\/[^\s]+$/.test(url) && !hasAsciiControlCharacters(url) && url.length <= 500;

/** All review acknowledgements are distinct from remediation verification.
 * This panel does not post journals, clear findings or mark a case "resolved".
 */
export function ReconciliationReviewSignoffPanel({
  companyId,
  caseRecord,
  canManage,
  onChanged,
}: {
  companyId: string;
  caseRecord: ReconciliationSavedCase;
  canManage: boolean;
  onChanged: () => void;
}) {
  const getHistory = useServerFn(listReconciliationReviewHistory);
  const progress = useServerFn(progressReconciliationReviewCase);
  const history = useMutation({
    mutationFn: () => getHistory({ data: { companyId, caseId: caseRecord.id } }),
  });
  const save = useMutation({
    mutationFn: (values: ProgressReconciliationReviewInput) => progress({ data: values }),
    onSuccess: () => onChanged(),
  });
  const [action, setAction] = useState<ReconciliationReviewAction>("attach_evidence");
  const [note, setNote] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [errorText, setErrorText] = useState("");
  const canSubmit =
    caseRecord.status === "in_review" && !!caseRecord.assigned_to && !!caseRecord.evidence_url;
  const canSignOff = caseRecord.status === "ready_for_review";
  const canReopen = caseRecord.status === "ready_for_review" || caseRecord.status === "reviewed";
  const canAttach = ["open", "in_review", "blocked"].includes(caseRecord.status);
  const available =
    (action === "attach_evidence" && canAttach) ||
    (action === "submit" && canSubmit) ||
    (action === "sign_off" && canSignOff) ||
    (action === "reopen" && canReopen);
  const canSave =
    available &&
    !save.isPending &&
    (action === "attach_evidence"
      ? validEvidenceUrl(evidenceUrl.trim()) && note.trim().length >= 3
      : note.trim().length >= 10);

  const run = async () => {
    if (!canManage || !canSave) return;
    setErrorText("");
    try {
      await save.mutateAsync({
        companyId,
        caseId: caseRecord.id,
        expectedVersion: caseRecord.version,
        action,
        note: note.trim(),
        evidenceUrl: action === "attach_evidence" ? evidenceUrl.trim() : null,
      });
      setNote("");
      setEvidenceUrl("");
      history.reset();
    } catch (error) {
      setErrorText(friendlyAuthError(error));
    }
  };
  return (
    <div className="space-y-3 rounded-md border p-3">
      <div>
        <h4 className="text-sm font-semibold">Independent review and supporting evidence</h4>
        <p className="text-xs text-muted-foreground">
          A completed review attests that a different assigned reviewer assessed the documented
          issue. It does NOT certify that the ledger is fixed, the exception has disappeared or
          source coverage is complete.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 text-xs">
        <p>
          Stage: <strong>{caseRecord.status}</strong>
        </p>
        <p>Case version: {caseRecord.version}</p>
        <p className="break-all">Submitted by: {caseRecord.submitted_by ?? "Not submitted"}</p>
        <p className="break-all">Reviewed by: {caseRecord.reviewed_by ?? "Not reviewed"}</p>
      </div>
      {caseRecord.evidence_url && validEvidenceUrl(caseRecord.evidence_url) ? (
        <p className="text-xs break-words">
          Supporting evidence:{" "}
          <a
            href={caseRecord.evidence_url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="underline"
          >
            Open external HTTPS evidence
          </a>
        </p>
      ) : null}
      {canManage ? (
        <div className="space-y-2">
          <Label htmlFor="exc-signoff-action">Review progression action</Label>
          <select
            id="exc-signoff-action"
            value={action}
            className="w-full rounded-md border bg-background p-2 text-sm"
            onChange={(e) => {
              setAction(e.target.value as ReconciliationReviewAction);
              setErrorText("");
            }}
          >
            <option value="attach_evidence" disabled={!canAttach}>
              Attach HTTPS evidence
            </option>
            <option value="submit" disabled={!canSubmit}>
              Submit to independent reviewer
            </option>
            <option value="sign_off" disabled={!canSignOff}>
              Independent review sign-off
            </option>
            <option value="reopen" disabled={!canReopen}>
              Reopen for investigation
            </option>
          </select>
          {action === "attach_evidence" ? (
            <div className="space-y-1">
              <Label htmlFor="exc-evidence-url">Supporting evidence HTTPS link</Label>
              <Input
                id="exc-evidence-url"
                value={evidenceUrl}
                placeholder="https://…"
                maxLength={500}
                onChange={(e) => setEvidenceUrl(e.target.value.trim())}
              />
            </div>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="exc-review-conclusion">Reason and review conclusion</Label>
            <textarea
              id="exc-review-conclusion"
              value={note}
              rows={3}
              maxLength={2000}
              className="w-full rounded-md border bg-background p-2 text-sm"
              placeholder="Explain the evidence assessed and any remaining discrepancy"
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <Button type="button" size="sm" disabled={!canSave} onClick={() => void run()}>
            {save.isPending ? "Saving review progression…" : "Save review action"}
          </Button>
          {action === "sign_off" ? (
            <p className="text-xs text-muted-foreground">
              Only the independently assigned reviewer (not the case creator or submitter) can
              complete sign-off. The server enforces this rule.
            </p>
          ) : null}
          {!available ? (
            <p className="text-xs text-muted-foreground">
              This action is unavailable at the current review stage.
            </p>
          ) : null}
        </div>
      ) : null}
      {errorText || save.isError ? (
        <p role="alert" className="text-xs text-destructive">
          {errorText || friendlyAuthError(save.error)}
        </p>
      ) : null}
      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={history.isPending}
          onClick={() => history.mutate()}
        >
          {history.isPending ? "Loading history…" : "Load versioned review history"}
        </Button>
        {history.isError ? (
          <p role="alert" className="text-xs text-destructive">
            History unavailable: {friendlyAuthError(history.error)}
          </p>
        ) : null}
        {history.data ? (
          <div className="space-y-2" aria-label="Reconciliation review action history">
            <p className="text-xs text-muted-foreground">
              Latest {history.data.events.length} action(s)
              {history.data.hasMore
                ? " · more than 100 actions exist; this is a partial history"
                : ""}
            </p>
            {history.data.events.map((event) => (
              <div key={event.id} className="rounded-md border p-2 space-y-1 text-xs">
                <p>
                  <strong>{event.action}</strong>
                  {" · "}
                  {event.created_at}
                </p>
                <p className="break-all text-muted-foreground">Actor: {event.actor_id}</p>
                <p className="whitespace-pre-wrap break-words">{event.note || "(No note)"}</p>
                <p className="text-muted-foreground">
                  Version: {String(event.new_state["version"] ?? "?")}
                  {" · "}
                  {String(event.old_state?.["status"] ?? "new")}
                  {" → "}
                  {String(event.new_state["status"] ?? "?")}
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
