import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, CircleHelp, Send, ShieldCheck, Undo2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useFormat } from "@/hooks/use-format";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  APPROVAL_STATUS_LABELS,
  availableBudgetApprovalActions,
  type BudgetApprovalAction,
} from "@/lib/budgets/budget-approval";
import {
  transitionBudgetApproval,
  type BudgetApprovalDetails,
} from "@/lib/budgets/budgets.functions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const ACTION_LABELS: Record<BudgetApprovalAction, string> = {
  submit: "Submit for approval",
  withdraw: "Withdraw request",
  approve: "Approve budget",
  reject: "Request changes",
  reopen: "Reopen budget",
};

const ACTION_ICONS = {
  submit: Send,
  withdraw: Undo2,
  approve: CheckCircle2,
  reject: XCircle,
  reopen: CircleHelp,
};

export function BudgetApprovalPanel({
  companyId,
  budgetId,
  canManage,
  dirty,
  hasAmounts,
  manuallyLocked,
  approval,
  loading,
  error,
  onRefresh,
}: {
  companyId: string;
  budgetId: string;
  canManage: boolean;
  dirty: boolean;
  hasAmounts: boolean;
  manuallyLocked: boolean;
  approval: BudgetApprovalDetails | undefined;
  loading: boolean;
  error: unknown;
  onRefresh: () => void;
}) {
  const fmt = useFormat();
  const queryClient = useQueryClient();
  const transitionFn = useServerFn(transitionBudgetApproval);
  const [action, setAction] = useState<BudgetApprovalAction | null>(null);
  const [note, setNote] = useState("");
  const [showHistory, setShowHistory] = useState(false);

  const allowed = availableBudgetApprovalActions({
    status: approval?.status ?? "draft",
    isRequester: approval?.viewerIsRequester ?? false,
    canManage,
    hasAmounts,
    manuallyLocked,
  });
  const canSubmitAction =
    Boolean(approval?.available) &&
    !loading &&
    !error &&
    !dirty &&
    action !== null &&
    allowed.includes(action) &&
    note.trim().length >= 3 &&
    note.trim().length <= 500;

  const mutation = useMutation({
    mutationFn: (requested: BudgetApprovalAction) =>
      transitionFn({
        data: {
          companyId,
          budgetId,
          action: requested,
          note: note.trim(),
        },
      }),
    onSuccess: async () => {
      setAction(null);
      setNote("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["budget-approval", companyId, budgetId] }),
        queryClient.invalidateQueries({ queryKey: ["budget-governance", companyId, budgetId] }),
        queryClient.invalidateQueries({ queryKey: ["budget", companyId, budgetId] }),
        queryClient.invalidateQueries({ queryKey: ["budgets", companyId] }),
      ]);
      onRefresh();
      toast.success("Budget approval status updated");
    },
    onError: (cause) => toast.error(friendlyAuthError(cause)),
  });

  return (
    <section className="mb-5 space-y-4 rounded-lg border p-4" aria-label="Budget approvals">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <ShieldCheck className="size-4" /> Budget approvals
          </h2>
          <p className="text-sm text-muted-foreground">
            Independent review with a permanent decision trail. Pending and approved plans cannot be
            edited.
          </p>
        </div>
        <span className="rounded-full border px-3 py-1 text-xs font-medium">
          {APPROVAL_STATUS_LABELS[approval?.status ?? "draft"]}
        </span>
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading approval status…</p>
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription>
            Approval status could not be verified: {friendlyAuthError(error)}. Editing is disabled
            until this can be checked.
          </AlertDescription>
        </Alert>
      ) : !approval?.available ? (
        <Alert>
          <AlertDescription>
            Budget approvals require the database migration
            20261106193000_budget_approval_workflows.sql. This organisation can continue using
            budgets without approvals until that migration is installed.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {approval.status === "pending" ? (
            <Alert>
              <AlertDescription>
                This budget is awaiting a decision by a different authorised user.
                {approval.viewerIsRequester
                  ? " You may withdraw your own request to revise it."
                  : " Review the saved plan before approving or requesting changes."}
              </AlertDescription>
            </Alert>
          ) : approval.status === "approved" ? (
            <Alert>
              <AlertDescription>
                This plan is approved and read-only. Reopening requires an audit reason and allows
                further changes before a new submission cycle.
              </AlertDescription>
            </Alert>
          ) : approval.status === "rejected" ? (
            <Alert>
              <AlertDescription>
                Changes were requested. Revise and save the plan, then submit it again.
              </AlertDescription>
            </Alert>
          ) : null}
          {approval.submittedAt ? (
            <p className="text-xs text-muted-foreground">
              Cycle {approval.cycle} · Submitted {fmt.dateTime(approval.submittedAt)}
              {approval.reviewedAt ? ` · Reviewed ${fmt.dateTime(approval.reviewedAt)}` : ""}
              {approval.decisionNote ? ` · Decision: ${approval.decisionNote}` : ""}
            </p>
          ) : null}
          {dirty ? (
            <p className="text-xs text-muted-foreground">
              Save or discard your unsaved changes before taking an approval action.
            </p>
          ) : null}
          {canManage && allowed.length > 0 ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {allowed.map((a) => {
                  const Icon = ACTION_ICONS[a];
                  return (
                    <Button
                      key={a}
                      type="button"
                      size="sm"
                      variant={action === a ? "secondary" : "outline"}
                      disabled={dirty || mutation.isPending || loading}
                      aria-pressed={action === a}
                      onClick={() => {
                        setAction(a);
                        setNote("");
                      }}
                    >
                      <Icon className="mr-2 size-4" />
                      {ACTION_LABELS[a]}
                    </Button>
                  );
                })}
              </div>
              {action && allowed.includes(action) ? (
                <div className="space-y-2 rounded-md border p-3">
                  <Label htmlFor="approval-action-note">
                    {ACTION_LABELS[action]} — reason or review remarks
                  </Label>
                  <Textarea
                    id="approval-action-note"
                    value={note}
                    maxLength={500}
                    rows={2}
                    placeholder="Record your decision and supporting information"
                    disabled={mutation.isPending}
                    onChange={(event) => setNote(event.target.value)}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={!canSubmitAction || mutation.isPending}
                      onClick={() => {
                        if (!action) return;
                        if (
                          (action === "approve" || action === "reopen") &&
                          !window.confirm(
                            action === "approve"
                              ? "Approve and make this budget read-only?"
                              : "Reopen this approved budget for further edits?",
                          )
                        ) {
                          return;
                        }
                        mutation.mutate(action);
                      }}
                    >
                      {mutation.isPending
                        ? "Saving…"
                        : `Confirm ${ACTION_LABELS[action].toLowerCase()}`}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={mutation.isPending}
                      onClick={() => {
                        setAction(null);
                        setNote("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : canManage && approval.status === "draft" && !hasAmounts ? (
            <p className="text-sm text-muted-foreground">
              Add and save at least one budget amount before requesting approval.
            </p>
          ) : canManage && manuallyLocked ? (
            <p className="text-sm text-muted-foreground">
              Unlock the manually locked budget before submitting it for review.
            </p>
          ) : null}
          <Button
            size="sm"
            type="button"
            variant="ghost"
            aria-expanded={showHistory}
            onClick={() => setShowHistory((current) => !current)}
          >
            {showHistory ? "Hide review history" : "View review history"} ({approval.events.length}
            {approval.events.length === 50 ? "+" : ""} recent)
          </Button>
          {showHistory ? (
            approval.events.length === 0 ? (
              <p className="text-sm text-muted-foreground">No review decisions yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cycle</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Actor</TableHead>
                      <TableHead>When</TableHead>
                      <TableHead>Remarks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {approval.events.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell className="tabular-nums">#{event.cycle}</TableCell>
                        <TableCell className="capitalize">{event.action}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {event.acted_by ? event.acted_by.slice(0, 8) : "Former user"}
                        </TableCell>
                        <TableCell>{fmt.dateTime(event.acted_at)}</TableCell>
                        <TableCell className="max-w-72 whitespace-normal">{event.note}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )
          ) : null}
        </>
      )}
    </section>
  );
}
