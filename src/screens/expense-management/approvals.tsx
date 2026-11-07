import { Link, useRouteContext } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ExpenseManagementSubnav } from "@/components/expenses/ExpenseManagementSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/common/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { listCompanyMembers } from "@/lib/company.functions";
import {
  isDelegationActive,
  userHasActiveIncomingDelegation,
} from "@/lib/expenses/delegation";
import type { ExpenseClaimSummary } from "@/lib/expenses/claims";
import {
  approveExpenseClaim,
  EXPENSE_APPROVAL_MIGRATION,
  EXPENSE_DELEGATION_MIGRATION,
  listExpenseApprovalDelegations,
  listExpenseClaims,
  postExpenseClaim,
  rejectExpenseClaim,
  returnExpenseClaim,
  revokeExpenseApprovalDelegation,
  saveExpenseApprovalDelegation,
  startExpenseClaimReview,
} from "@/lib/expenses/expenses.functions";
import type { Permission } from "@/lib/permissions";

type DecisionKind = "return" | "reject";

export function ExpenseManagementApprovalsPage() {
  const { user } = useRouteContext({ from: "/_authenticated" });
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const queryClient = useQueryClient();
  const canApprove =
    can("expenses.approve" as Permission) || can("expenses.admin" as Permission);
  const canPost =
    can("expenses.post" as Permission) || can("expenses.admin" as Permission);
  const canListMembers = can("members.view" as Permission) || can("expenses.admin" as Permission);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [activeDecision, setActiveDecision] = useState<{
    claimId: string;
    kind: DecisionKind;
  } | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const [delegateUserId, setDelegateUserId] = useState("");
  const [delegateStart, setDelegateStart] = useState(today);
  const [delegateEnd, setDelegateEnd] = useState(today);
  const [delegateNote, setDelegateNote] = useState("");

  const fetchClaims = useServerFn(listExpenseClaims);
  const startReview = useServerFn(startExpenseClaimReview);
  const approveClaim = useServerFn(approveExpenseClaim);
  const returnClaim = useServerFn(returnExpenseClaim);
  const rejectClaim = useServerFn(rejectExpenseClaim);
  const postClaim = useServerFn(postExpenseClaim);
  const fetchDelegations = useServerFn(listExpenseApprovalDelegations);
  const saveDelegation = useServerFn(saveExpenseApprovalDelegation);
  const revokeDelegation = useServerFn(revokeExpenseApprovalDelegation);
  const fetchMembers = useServerFn(listCompanyMembers);

  const delegationsQ = useQuery({
    queryKey: ["expense-approval-delegations", company?.id],
    queryFn: () => fetchDelegations({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id),
    retry: false,
  });

  const actingAsDelegate = useMemo(
    () =>
      userHasActiveIncomingDelegation(delegationsQ.data ?? [], user.id, today),
    [delegationsQ.data, user.id, today],
  );
  const canActAsApprover = canApprove || actingAsDelegate;
  const delegationProbePending = delegationsQ.isLoading && !canApprove && !canPost;

  const membersQ = useQuery({
    queryKey: ["company-members", company?.id, "expense-delegation"],
    queryFn: () => fetchMembers({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canApprove && canListMembers,
    retry: false,
  });

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
    enabled: Boolean(company?.id) && canActAsApprover,
    retry: false,
  });

  const readyToPostQ = useQuery({
    queryKey: ["expense-claims", company?.id, "ready-to-post"],
    queryFn: () =>
      fetchClaims({
        data: {
          companyId: company!.id,
          scope: "all",
          approvalStatuses: ["approved"],
        },
      }),
    enabled: Boolean(company?.id) && canPost,
    retry: false,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["expense-claims", company?.id] });
    void queryClient.invalidateQueries({ queryKey: ["expense-management-overview", company?.id] });
  };

  const post = useMutation({
    mutationFn: async (claim: ExpenseClaimSummary) => {
      if (!company) throw new Error("Select a company first.");
      return postClaim({
        data: { companyId: company.id, claimId: claim.id, version: claim.version },
      });
    },
    onSuccess: () => {
      invalidate();
      toast.success("Claim posted to the ledger.");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

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

  const saveDelegationMut = useMutation({
    mutationFn: async () => {
      if (!company) throw new Error("Select a company first.");
      if (!delegateUserId) throw new Error("Choose a delegate.");
      return saveDelegation({
        data: {
          companyId: company.id,
          toUserId: delegateUserId,
          startsOn: delegateStart,
          endsOn: delegateEnd,
          note: delegateNote.trim() || undefined,
        },
      });
    },
    onSuccess: async () => {
      toast.success("Delegation saved");
      setDelegateNote("");
      await queryClient.invalidateQueries({
        queryKey: ["expense-approval-delegations", company?.id],
      });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const revokeDelegationMut = useMutation({
    mutationFn: async (delegationId: string) => {
      if (!company) throw new Error("Select a company first.");
      return revokeDelegation({
        data: { companyId: company.id, delegationId },
      });
    },
    onSuccess: async () => {
      toast.success("Delegation revoked");
      await queryClient.invalidateQueries({
        queryKey: ["expense-approval-delegations", company?.id],
      });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }

  if (delegationProbePending) {
    return (
      <>
        <PageHeader title="Approvals" description="Expense Management" />
        <ExpenseManagementSubnav current="approvals" />
        <LoadingState />
      </>
    );
  }

  if (!canActAsApprover && !canPost) {
    return (
      <>
        <PageHeader title="Approvals" />
        <ExpenseManagementSubnav current="approvals" />
        <EmptyState
          title="No access"
          description="Ask an administrator for expenses.approve or expenses.post, or request temporary approval cover."
        />
      </>
    );
  }
  if ((canActAsApprover && queueQ.isLoading) || (canPost && readyToPostQ.isLoading)) {
    return (
      <>
        <PageHeader title="Approvals" description="Expense Management" />
        <ExpenseManagementSubnav current="approvals" />
        <LoadingState />
      </>
    );
  }
  if (canActAsApprover && queueQ.isError) {
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
  const readyToPost = (readyToPostQ.data ?? []).filter(
    (claim) => claim.postingStatus === "ready" || claim.postingStatus === "failed",
  );

  return (
    <>
      <PageHeader
        title="Approvals"
        description="Review submitted claims and post approved employee-paid accruals."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/purchases/employee-expenses">Legacy employee expenses</Link>
          </Button>
        }
      />
      <ExpenseManagementSubnav current="approvals" />

      <Alert className="mb-6">
        <AlertTitle>Approval and accrual posting</AlertTitle>
        <AlertDescription>
          Approving marks the claim ready to post. Posting creates the expense accrual journal (not
          a bank payment). Self-approval is blocked when organisation settings require it.
          {actingAsDelegate
            ? " You are currently acting as a delegated approver."
            : ""}
        </AlertDescription>
      </Alert>

      {canApprove ? (
        <section className="mb-8 space-y-4 rounded-lg border p-4">
          <div>
            <h2 className="text-base font-semibold">Approval cover (delegation)</h2>
            <p className="text-sm text-muted-foreground">
              Temporarily let another organisation member approve claims while you are away.
            </p>
          </div>
          {delegationsQ.isError ? (
            friendlyAuthError(delegationsQ.error).includes("20261107150000") ? (
              <Alert>
                <AlertTitle>Database update required</AlertTitle>
                <AlertDescription>{EXPENSE_DELEGATION_MIGRATION}</AlertDescription>
              </Alert>
            ) : (
              <ErrorState
                title="Could not load delegations"
                description={friendlyAuthError(delegationsQ.error)}
                onRetry={() => delegationsQ.refetch()}
              />
            )
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-4">
                <div className="grid gap-2 md:col-span-2">
                  <Label>Delegate</Label>
                  {canListMembers ? (
                    <Select value={delegateUserId} onValueChange={setDelegateUserId}>
                      <SelectTrigger aria-label="Choose approval delegate">
                        <SelectValue placeholder="Select member" />
                      </SelectTrigger>
                      <SelectContent>
                        {(membersQ.data ?? [])
                          .filter((member) => member.status === "active" && !member.is_you)
                          .map((member) => (
                            <SelectItem key={member.user_id} value={member.user_id}>
                              {member.full_name || member.email || member.user_id}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Member picker needs members.view.
                    </p>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="em-del-start">Starts</Label>
                  <Input
                    id="em-del-start"
                    type="date"
                    value={delegateStart}
                    onChange={(event) => setDelegateStart(event.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="em-del-end">Ends</Label>
                  <Input
                    id="em-del-end"
                    type="date"
                    value={delegateEnd}
                    onChange={(event) => setDelegateEnd(event.target.value)}
                  />
                </div>
                <div className="grid gap-2 md:col-span-3">
                  <Label htmlFor="em-del-note">Note (optional)</Label>
                  <Input
                    id="em-del-note"
                    value={delegateNote}
                    onChange={(event) => setDelegateNote(event.target.value)}
                    placeholder="Holiday cover"
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    disabled={saveDelegationMut.isPending || !delegateUserId}
                    onClick={() => saveDelegationMut.mutate()}
                  >
                    {saveDelegationMut.isPending ? "Saving…" : "Save cover"}
                  </Button>
                </div>
              </div>
              {(delegationsQ.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No delegations recorded yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>From → To</TableHead>
                      <TableHead>Dates</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(delegationsQ.data ?? []).map((row) => {
                      const active = isDelegationActive(row, today);
                      const canRevoke =
                        row.fromUserId === user.id || can("expenses.admin" as Permission);
                      return (
                        <TableRow key={row.id}>
                          <TableCell className="font-mono text-xs">
                            {row.fromUserId.slice(0, 8)} → {row.toUserId.slice(0, 8)}
                          </TableCell>
                          <TableCell>
                            {row.startsOn} → {row.endsOn}
                          </TableCell>
                          <TableCell>
                            <Badge variant={active ? "default" : "secondary"}>
                              {row.revokedAt ? "revoked" : active ? "active" : "scheduled/ended"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {canRevoke && !row.revokedAt ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={revokeDelegationMut.isPending}
                                onClick={() => revokeDelegationMut.mutate(row.id)}
                              >
                                Revoke
                              </Button>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </section>
      ) : null}

      {canActAsApprover && queue.length === 0 ? (
        <EmptyState
          title="No claims waiting"
          description="Submitted and in-review claims appear here."
        />
      ) : null}
      {canActAsApprover && queue.length > 0 ? (
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
      ) : null}

      {canPost ? (
        <div className="mt-10">
          <h2 className="mb-3 text-base font-semibold">Ready to post</h2>
          {readyToPost.length === 0 ? (
            <EmptyState
              title="No approved claims ready"
              description="Approved employee-paid claims awaiting ledger accrual appear here."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Claim</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead className="text-right">Post</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {readyToPost.map((claim) => (
                  <TableRow key={claim.id}>
                    <TableCell>
                      <div className="font-medium">{claim.claimNumber || "Claim"}</div>
                      <div className="text-sm text-muted-foreground">{claim.title}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{claim.postingStatus}</Badge>
                    </TableCell>
                    <TableCell>
                      {fromMinorUnits(claim.totalMinor, claim.claimCurrency)} {claim.claimCurrency}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        disabled={post.isPending}
                        onClick={() => post.mutate(claim)}
                      >
                        Post accrual
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      ) : null}
    </>
  );
}
