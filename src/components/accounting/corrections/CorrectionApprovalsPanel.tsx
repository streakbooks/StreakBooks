import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import {
  decideCorrectionApproval,
  listCorrectionApprovalEvents,
  listCorrectionApprovalRequests,
  setCorrectionApprovalPolicy,
  type CorrectionApprovalRequest,
  type CorrectionApprovalSettings,
} from "@/lib/accounting/corrections/approval.functions";
import { applyCorrection } from "@/lib/accounting/corrections/correction.functions";
import { correctionInput, exactMoney } from "@/lib/accounting/corrections/contracts";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CorrectionApprovalsPanel({
  companyId,
  settings,
  canPost,
  decimals,
}: {
  companyId: string;
  settings: CorrectionApprovalSettings;
  canPost: boolean;
  decimals: number;
}) {
  const qc = useQueryClient();
  const list = useServerFn(listCorrectionApprovalRequests);
  const events = useServerFn(listCorrectionApprovalEvents);
  const decide = useServerFn(decideCorrectionApproval);
  const changePolicy = useServerFn(setCorrectionApprovalPolicy);
  const post = useServerFn(applyCorrection);
  const [page, setPage] = useState(0);
  const [reviewId, setReviewId] = useState("");
  const [decisionNote, setDecisionNote] = useState("");
  const [status, setStatus] = useState("all");
  const [historyId, setHistoryId] = useState("");

  const rowsQ = useQuery({
    queryKey: ["correction-approval-requests", companyId, page],
    queryFn: () => list({ data: { companyId, page } }),
  });
  const eventsQ = useQuery({
    queryKey: ["correction-approval-events", companyId, historyId],
    enabled: Boolean(historyId),
    queryFn: () => events({ data: { companyId, approvalId: historyId } }),
  });
  const refresh = async () => {
    await qc.invalidateQueries({ predicate: (q) => q.queryKey.includes(companyId) });
  };

  const policyM = useMutation({
    mutationFn: (required: boolean) => changePolicy({ data: { companyId, required } }),
    onSuccess: async () => {
      await refresh();
      toast.success("Correction approval policy saved");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const decisionM = useMutation({
    mutationFn: ({ request, approve }: { request: CorrectionApprovalRequest; approve: boolean }) =>
      decide({
        data: {
          companyId,
          approvalId: request.id,
          approve,
          note: decisionNote,
          expectedVersion: request.version,
        },
      }),
    onSuccess: async () => {
      setReviewId("");
      setDecisionNote("");
      await refresh();
      toast.success("Independent review decision recorded");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const postM = useMutation({
    mutationFn: (request: CorrectionApprovalRequest) =>
      post({
        data: {
          input: correctionInput.parse(request.input),
          requestKey: request.request_key,
          previewHash: request.preview_hash,
        },
      }),
    onSuccess: async () => {
      await refresh();
      toast.success("Approved correction posted to the general ledger");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const all = rowsQ.data?.rows ?? [];
  const shown = status === "all" ? all : all.filter((request) => request.status === status);
  const busy = policyM.isPending || decisionM.isPending || postM.isPending;

  return (
    <section aria-label="Correction approval workflow" className="space-y-4 rounded-xl border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Independent correction approvals</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Maker-checker review is {settings.required ? "required" : "not required"} for this
            organisation. When enabled, an authorised second person must approve the exact posting
            plan; the database rejects direct, unapproved correction postings.
          </p>
        </div>
        {settings.can_configure ? (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              const next = !settings.required;
              const warning = next
                ? "Enable mandatory independent review? A second user with Journal Approval permission must approve every correction before its maker can post. A one-person organisation cannot complete corrections while this is enabled."
                : "Disable mandatory independent review? Direct correction posting will become available again. This action is audited.";
              if (window.confirm(warning)) policyM.mutate(next);
            }}
          >
            {settings.required ? "Disable approval requirement" : "Require independent approval"}
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Review permission: {settings.can_approve ? "granted" : "not granted"}. A maker cannot
        approve their own work. Decision notes, identities, timestamps and exact preview hashes are
        retained as audit evidence. Existing company and journal posting permissions remain
        required.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          Queue status
          <select
            aria-label="Correction approval status filter"
            className="block h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {/* lookup-fixed-enum: Approval workflow statuses are fixed by the database. */}
            <option value="all">All on this page</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="posted">Posted</option>
          </select>
        </label>
        <Button
          variant="outline"
          disabled={busy || rowsQ.isFetching}
          onClick={() => void rowsQ.refetch()}
        >
          Refresh approval queue
        </Button>
        <p className="text-xs text-muted-foreground">
          Showing {shown.length} of {all.length} loaded requests on page {page + 1}.
        </p>
      </div>
      {rowsQ.isError ? (
        <QueryErrorState queries={[rowsQ]} title="Could not load approval requests" />
      ) : null}
      {rowsQ.isPending ? <p>Loading approval queue…</p> : null}
      {!rowsQ.isPending && all.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No approval requests on this page. Preview a correction, then submit it for review.
        </p>
      ) : null}
      {all.length > 0 && shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No loaded requests match this status; change the filter or browse another page.
        </p>
      ) : null}
      {shown.map((request) => {
        const isMaker = request.submitted_by === settings.user_id;
        const canDecide = settings.can_approve && !isMaker && request.status === "pending";
        const canComplete = isMaker && canPost && request.status === "approved";
        const isReviewing = request.id === reviewId;
        return (
          <details key={request.id} className="rounded-md border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              {request.status.toUpperCase()} · {request.submitted_at} · {request.plan.target.code}{" "}
              {request.plan.target.name} · {request.input.reason}
            </summary>
            <div className="mt-3 space-y-3 text-sm">
              <p>
                Approval ID: {request.id} · Request key: {request.request_key}
              </p>
              <p>
                Maker: {request.submitted_by} · Checker: {request.decided_by ?? "Awaiting review"}
              </p>
              <p>
                Policy: {request.input.mode} · {request.plan.line_count} selected lines ·{" "}
                {request.plan.journal_count} correction journals · {request.plan.currency}{" "}
                {exactMoney(request.plan.gross_minor, decimals)} gross
              </p>
              <p>Preview fingerprint: {request.preview_hash}</p>
              {request.plan.impact ? (
                <p>
                  Estimated profit impact: {request.plan.currency}{" "}
                  {exactMoney(request.plan.impact.profit_change_minor, decimals)} ·{" "}
                  {request.plan.impact.cross_statement_lines} cross-statement lines
                </p>
              ) : null}
              <ul className="list-disc space-y-1 pl-5">
                {request.plan.rows.map((line) => (
                  <li key={line.id}>
                    <Link
                      to="/accounting"
                      search={{ tab: "journals", journal: line.journal_id }}
                      className="underline"
                    >
                      Source journal #{line.journal_number}
                    </Link>
                    {" · "} {line.source_account_code} → {request.plan.target.code} ·{" "}
                    {line.posting_date} · {request.plan.currency}{" "}
                    {exactMoney(BigInt(line.debit_minor) + BigInt(line.credit_minor), decimals)}
                  </li>
                ))}
              </ul>
              {request.status === "rejected" ? (
                <p>Rejection reason: {request.decision_note}</p>
              ) : null}
              {request.status === "posted" ? (
                <p>
                  Posted by {request.posted_by} at {request.posted_at}. Correction batch{" "}
                  {request.posted_batch_id}.
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {canDecide ? (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      setReviewId(isReviewing ? "" : request.id);
                      setDecisionNote("");
                    }}
                  >
                    {isReviewing ? "Cancel review" : "Review approval"}
                  </Button>
                ) : null}
                {canComplete ? (
                  <Button
                    disabled={busy}
                    onClick={() => {
                      const message = `Post approved correction ${request.id}? The stored preview will be revalidated against current ledger and period locks. The maker must be the posting user.`;
                      if (window.confirm(message)) postM.mutate(request);
                    }}
                  >
                    Post approved correction
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => setHistoryId(historyId === request.id ? "" : request.id)}
                >
                  {historyId === request.id ? "Hide audit events" : "View audit events"}
                </Button>
              </div>
              {isReviewing ? (
                <div className="space-y-3 rounded border p-3">
                  <p>
                    Verify source journals, destination account, posting dates and financial
                    statement impact before deciding. A decision applies only to this exact plan.
                  </p>
                  <label className="block space-y-1">
                    Written review conclusion
                    <Input
                      aria-label="Correction approval decision note"
                      value={decisionNote}
                      minLength={5}
                      maxLength={1000}
                      onChange={(event) => setDecisionNote(event.target.value)}
                    />
                  </label>
                  <div className="flex gap-2">
                    <Button
                      disabled={busy || decisionNote.trim().length < 5}
                      onClick={() => {
                        if (window.confirm("Independently approve this exact correction plan?")) {
                          decisionM.mutate({ request, approve: true });
                        }
                      }}
                    >
                      Approve plan
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy || decisionNote.trim().length < 5}
                      onClick={() => {
                        if (window.confirm("Reject this correction? A new preview is required.")) {
                          decisionM.mutate({ request, approve: false });
                        }
                      }}
                    >
                      Reject plan
                    </Button>
                  </div>
                </div>
              ) : null}
              {historyId === request.id ? (
                <div className="space-y-1 rounded border p-3">
                  <h4 className="font-medium">Immutable approval events (first 100)</h4>
                  {eventsQ.isPending ? <p>Loading audit evidence…</p> : null}
                  {eventsQ.isError ? (
                    <QueryErrorState queries={[eventsQ]} title="Could not load approval events" />
                  ) : null}
                  {eventsQ.data?.map((event) => (
                    <p key={event.id}>
                      {event.created_at} · {event.action} · {event.actor_id} · v{event.version}
                      {event.note ? ` · ${event.note}` : ""}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          </details>
        );
      })}
      <div className="flex gap-2">
        <Button
          variant="outline"
          disabled={busy || rowsQ.isFetching || page === 0}
          onClick={() => {
            setReviewId("");
            setHistoryId("");
            setPage((current) => current - 1);
          }}
        >
          Previous approvals
        </Button>
        <Button
          variant="outline"
          disabled={busy || rowsQ.isFetching || !rowsQ.data?.has_more}
          onClick={() => {
            setReviewId("");
            setHistoryId("");
            setPage((current) => current + 1);
          }}
        >
          Next approvals
        </Button>
      </div>
    </section>
  );
}
