import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ExpenseManagementSubnav } from "@/components/expenses/ExpenseManagementSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/common/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { fromMinorUnits } from "@/lib/accounting/money";
import { friendlyAuthError } from "@/lib/auth-helpers";
import type { ExpenseClaimSummary } from "@/lib/expenses/claims";
import {
  approveExpenseClaim,
  EXPENSE_APPROVAL_MIGRATION,
  listExpenseClaims,
  rejectExpenseClaim,
  returnExpenseClaim,
  startExpenseClaimReview,
} from "@/lib/expenses/expenses.functions";
import type { Permission } from "@/lib/permissions";

type DecisionKind = "return" | "reject";

export function ExpenseManagementApprovalsPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const queryClient = useQueryClient();
  const canApprove =
    can("expenses.approve" as Permission) || can("expenses.admin" as Permission);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [activeDecision, setActiveDecision] = useState<{
    claimId: string;
    kind: DecisionKind;
  } | null>(null);

  const fetchClaims = useServerFn(listExpenseClaims);
  const startReview = useServerFn(startExpenseClaimReview);
  const approveClaim = useServerFn(approveExpenseClaim);
  const returnClaim = useServerFn(returnExpenseClaim);
  const rejectClaim = useServerFn(rejectExpenseClaim);

  const queueQ = useQuery({
    queryKey: ["expense-claims", company?.id, "approvals"],
    queryFn: () =>
      fetchClaims({
        data: {
          companyId: company!.id,
          scope: "all",
          approvalStatuses: ["submitted", "in_review"],
        },
      }),
    enabled: Boolean(company?.id) && canApprove,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["expense-claims", company?.id] });
    void queryClient.invalidateQueries({ queryKey: ["expense-management-overview", company?.id] });
  };

  const runDecision = useMutation({
    mutationFn: async (input: {
      claim: ExpenseClaimSummary;
      action: "review" | "approve" | "return" | "reject";
    }) => {
      if (!company) throw new Error("Select a company first.");
      const base = {
        companyId: company.id,
        claimId: input.claim.id,
        version: input.claim.version,
      };
      if (input.action === "review") return startReview({ data: base });
      if (input.action === "approve") {
        return approveClaim({
          data: { ...base, note: notes[input.claim.id]?.trim() || undefined },
        });
      }
      const note = (notes[input.claim.id] ?? "").trim();
      if (!note) throw new Error(`A ${input.action} reason is required.`);
      if (input.action === "return") return returnClaim({ data: { ...base, note } });
      return rejectClaim({ data: { ...base, note } });
    },
    onSuccess: (_result, variables) => {
      setActiveDecision(null);
      setNotes((current) => {
        const next = { ...current };
        delete next[variables.claim.id];
        return next;
      });
      invalidate();
      const labels = {
        review: "Claim moved into review.",
        approve: "Claim approved.",
        return: "Claim returned to the claimant.",
        reject: "Claim rejected.",
      } as const;
      toast.success(labels[variables.action]);
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canApprove) {
    return (
      <>
        <PageHeader title="Approvals" />
        <ExpenseManagementSubnav current="approvals" />
        <EmptyState
          title="No access"
          description="Ask an administrator for expenses.approve."
        />
      </>
    );
  }
  if (queueQ.isPending) return <LoadingState />;
  if (queueQ.isError) {
    const message = friendlyAuthError(queueQ.error);
    return (
      <>
        <PageHeader title="Approvals" />
        <ExpenseManagementSubnav current="approvals" />
        {message.includes("20261107135000") || message.includes("20261107123000") ? (
          <Alert>
            <AlertTitle>Migration required</AlertTitle>
            <AlertDescription>{EXPENSE_APPROVAL_MIGRATION}</AlertDescription>
          </Alert>
        ) : (
          <ErrorState
            title="Could not load approval queue"
            description={message}
            onRetry={() => queueQ.refetch()}
          />
        )}
      </>
    );
  }

  const queue = queueQ.data ?? [];

  return (
    <>
      <PageHeader
        title="Approvals"
        description="Review submitted expense claims. Approval does not post journals or pay reimbursements."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/purchases/employee-expenses">Legacy employee expenses</Link>
          </Button>
        }
      />
      <ExpenseManagementSubnav current="approvals" />

      <Alert className="mb-6">
        <AlertTitle>Approval only</AlertTitle>
        <AlertDescription>
          Approving marks the claim ready for later posting (EM-06) and reimbursement (EM-07).
          Self-approval is blocked when organisation settings require it.
        </AlertDescription>
      </Alert>

      {queue.length === 0 ? (
        <EmptyState
          title="No claims waiting"
          description="Submitted and in-review claims appear here."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Claim</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Decision</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {queue.map((claim) => {
              const decisionOpen =
                activeDecision?.claimId === claim.id ? activeDecision.kind : null;
              return (
                <TableRow key={claim.id}>
                  <TableCell>
                    <div className="font-medium">{claim.claimNumber || "Claim"}</div>
                    <div className="text-sm text-muted-foreground">{claim.title}</div>
                    <Button asChild variant="link" className="h-auto px-0" size="sm">
                      <Link
                        to="/expense-management/claims/$claimId"
                        params={{ claimId: claim.id }}
                      >
                        Open detail
                      </Link>
                    </Button>
                  </TableCell>
                  <TableCell>{claim.claimDate}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{claim.approvalStatus}</Badge>
                  </TableCell>
                  <TableCell>
                    {fromMinorUnits(claim.totalMinor, claim.claimCurrency)} {claim.claimCurrency}
                  </TableCell>
                  <TableCell>
                    <div className="flex max-w-md flex-col gap-2">
                      <div className="flex flex-wrap gap-2">
                        {claim.approvalStatus === "submitted" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={runDecision.isPending}
                            onClick={() =>
                              runDecision.mutate({ claim, action: "review" })
                            }
                          >
                            Start review
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          disabled={runDecision.isPending}
                          onClick={() => runDecision.mutate({ claim, action: "approve" })}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={runDecision.isPending}
                          onClick={() => setActiveDecision({ claimId: claim.id, kind: "return" })}
                        >
                          Return
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={runDecision.isPending}
                          onClick={() => setActiveDecision({ claimId: claim.id, kind: "reject" })}
                        >
                          Reject
                        </Button>
                      </div>
                      {decisionOpen ? (
                        <div className="grid gap-2 rounded-md border p-3">
                          <Label htmlFor={`em-approval-note-${claim.id}`}>
                            {decisionOpen === "return" ? "Return reason" : "Rejection reason"}
                          </Label>
                          <Textarea
                            id={`em-approval-note-${claim.id}`}
                            value={notes[claim.id] ?? ""}
                            onChange={(event) =>
                              setNotes((current) => ({
                                ...current,
                                [claim.id]: event.target.value,
                              }))
                            }
                            rows={3}
                            required
                          />
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant={decisionOpen === "reject" ? "destructive" : "default"}
                              disabled={runDecision.isPending || !(notes[claim.id] ?? "").trim()}
                              onClick={() =>
                                runDecision.mutate({
                                  claim,
                                  action: decisionOpen,
                                })
                              }
                            >
                              Confirm {decisionOpen}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={runDecision.isPending}
                              onClick={() => setActiveDecision(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </>
  );
}
