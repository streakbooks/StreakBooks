import { QueryErrorState } from "@/components/common/QueryErrorState";
import { useState } from "react";

import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import {
  approveAndReimburseClaim,
  listEmployeeClaims,
  listPaymentAccounts,
  rejectEmployeeClaim,
} from "@/lib/purchases/purchases.functions";
import { fromMinorUnits } from "@/lib/accounting/money";
import { useCan } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { AccountLookup } from "@/components/lookup";
import { LoadingState, ErrorState, EmptyState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Legacy employee-expense claims list / approve path.
 * New claim creation is owned by Expense Management → My Expenses.
 */
export function EmployeeExpensesPage() {
  const { company } = useActiveCompany();
  const queryClient = useQueryClient();
  const fetchClaims = useServerFn(listEmployeeClaims);
  const fetchPaymentAccounts = useServerFn(listPaymentAccounts);
  const { can } = useCan();
  const approve = useServerFn(approveAndReimburseClaim);
  const companyId = company?.id;
  const currency = company?.base_currency ?? "GBP";

  const claimsQ = useQuery({
    queryKey: ["claims", companyId],
    enabled: Boolean(companyId),
    queryFn: () => fetchClaims({ data: { companyId: companyId! } }),
  });

  const paymentAccountsQ = useQuery({
    queryKey: ["payment-accounts", companyId],
    enabled: Boolean(companyId) && can("expenses.approve"),
    queryFn: () => fetchPaymentAccounts({ data: { companyId: companyId! } }),
  });
  const [paymentAccountId, setPaymentAccountId] = useState("");

  const doReject = useServerFn(rejectEmployeeClaim);

  const approveMutation = useMutation({
    mutationFn: (claimId: string) =>
      approve({ data: { companyId: companyId!, claimId, paymentAccountId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["claims", companyId] });
      toast.success("Claim approved and reimbursed (ledger posted)");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  const rejectMutation = useMutation({
    mutationFn: (claimId: string) => doReject({ data: { companyId: companyId!, claimId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["claims", companyId] });
      toast.success("Claim rejected (no ledger posting)");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  const requiredQueries = [paymentAccountsQ];
  if (requiredQueries.some((query) => query.isError && query.data === undefined))
    return <QueryErrorState queries={requiredQueries} title="Could not load expense accounts" />;

  if (!companyId) return <EmptyState title="No organisation" description="Select a company." />;

  return (
    <ListWorkspace
      title="Employee expenses"
      description="Legacy claims list and reimbursement. Submit new claims from Expenses → My Expenses."
      actions={
        <Button size="sm" asChild>
          <Link
            to="/expense-management/$section"
            params={{ section: "my-expenses" }}
            search={{ create: true }}
          >
            New expense claim
          </Link>
        </Button>
      }
    >
      <Alert className="mb-6">
        <AlertTitle>Create claims in Expense Management</AlertTitle>
        <AlertDescription>
          This Purchases page keeps the legacy approve-and-pay list. New multi-line drafts open under
          Expenses → My Expenses.
        </AlertDescription>
      </Alert>

      {can("expenses.approve") ? (
        <div className="mb-4 max-w-sm space-y-2">
          <Label>Reimbursement payment account (for approvals)</Label>
          <AccountLookup
            ariaLabel="Reimbursement payment account"
            purpose="bank"
            accounts={
              (paymentAccountsQ.data ?? []) as Array<{ id: string; code: string; name: string }>
            }
            value={paymentAccountId}
            onChange={setPaymentAccountId}
            companyId={companyId}
            placeholder="Bank or cash account"
            allowClear={false}
          />
        </div>
      ) : null}

      {claimsQ.isPending ? (
        <LoadingState />
      ) : claimsQ.isError ? (
        <ErrorState
          onRetry={() => void claimsQ.refetch()}
          title="Could not load claims"
          description={friendlyAuthError(claimsQ.error)}
        />
      ) : (claimsQ.data ?? []).length === 0 ? (
        <EmptyState
          title="No legacy claims"
          description="Create a new claim in Expense Management."
          action={
            <Button size="sm" asChild>
              <Link
                to="/expense-management/$section"
                params={{ section: "my-expenses" }}
                search={{ create: true }}
              >
                New expense claim
              </Link>
            </Button>
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Claimant</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(
              claimsQ.data as Array<{
                id: string;
                claim_date: string;
                description: string;
                status: string;
                amount_minor: number;
                claimant_name: string | null;
                is_mine: boolean;
              }>
            ).map((c) => (
              <TableRow key={c.id}>
                <TableCell>{c.claim_date}</TableCell>
                <TableCell>{c.is_mine ? "You" : (c.claimant_name ?? "—")}</TableCell>
                <TableCell>{c.description}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="capitalize">
                    {c.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {fromMinorUnits(BigInt(c.amount_minor), currency)}
                </TableCell>
                <TableCell className="space-x-2 text-right">
                  {c.status === "submitted" && c.is_mine && can("expenses.approve") ? (
                    <span className="text-xs text-muted-foreground">Needs another approver</span>
                  ) : null}
                  {c.status === "submitted" && !c.is_mine && can("expenses.approve") ? (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={rejectMutation.isPending}
                        onClick={() => rejectMutation.mutate(c.id)}
                      >
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={approveMutation.isPending || !paymentAccountId}
                        onClick={() => approveMutation.mutate(c.id)}
                      >
                        {approveMutation.isPending ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : null}
                        Approve & reimburse
                      </Button>
                    </>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </ListWorkspace>
  );
}
