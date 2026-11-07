import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ExpenseManagementSubnav } from "@/components/expenses/ExpenseManagementSubnav";
import { DocumentRecordPanel } from "@/components/documents/DocumentRecordPanel";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/common/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  EXPENSE_POSTING_MIGRATION,
  getExpenseClaim,
  postExpenseClaim,
} from "@/lib/expenses/expenses.functions";
import type { Permission } from "@/lib/permissions";

export function ExpenseManagementClaimDetailPage({ claimId }: { claimId: string }) {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const queryClient = useQueryClient();
  const canPost =
    can("expenses.post" as Permission) || can("expenses.admin" as Permission);
  const fetchClaim = useServerFn(getExpenseClaim);
  const postClaim = useServerFn(postExpenseClaim);

  const claimQ = useQuery({
    queryKey: ["expense-claim", company?.id, claimId],
    queryFn: () => fetchClaim({ data: { companyId: company!.id, claimId } }),
    enabled: Boolean(company?.id && claimId),
  });

  const post = useMutation({
    mutationFn: async () => {
      if (!company || !claimQ.data) throw new Error("Claim not loaded.");
      return postClaim({
        data: {
          companyId: company.id,
          claimId: claimQ.data.id,
          version: claimQ.data.version,
        },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["expense-claim", company?.id, claimId] });
      void queryClient.invalidateQueries({ queryKey: ["expense-claims", company?.id] });
      void queryClient.invalidateQueries({ queryKey: ["expense-management-overview", company?.id] });
      toast.success("Claim posted to the ledger (employee payable accrual).");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (claimQ.isPending) return <LoadingState />;
  if (claimQ.isError) {
    const message = friendlyAuthError(claimQ.error);
    return (
      <>
        <PageHeader title="Expense claim" />
        {message.includes("20261107137000") ? (
          <Alert>
            <AlertTitle>Migration required</AlertTitle>
            <AlertDescription>{EXPENSE_POSTING_MIGRATION}</AlertDescription>
          </Alert>
        ) : (
          <ErrorState
            title="Could not load claim"
            description={message}
            onRetry={() => claimQ.refetch()}
          />
        )}
      </>
    );
  }

  const claim = claimQ.data;
  if (!claim) {
    return <EmptyState title="Claim not found" description="It may have been deleted." />;
  }

  const canPostNow =
    canPost &&
    claim.approvalStatus === "approved" &&
    claim.paymentSource === "employee_paid" &&
    (claim.postingStatus === "ready" || claim.postingStatus === "failed") &&
    !claim.postedJournalId;

  return (
    <>
      <PageHeader
        title={claim.claimNumber}
        description={claim.title}
        actions={
          <div className="flex flex-wrap gap-2">
            {canPostNow ? (
              <Button size="sm" disabled={post.isPending} onClick={() => post.mutate()}>
                {post.isPending ? "Posting…" : "Post to ledger"}
              </Button>
            ) : null}
            <Button asChild variant="outline" size="sm">
              <Link to="/expense-management/my-expenses">Back to My Expenses</Link>
            </Button>
          </div>
        }
      />
      <ExpenseManagementSubnav current="my-expenses" />

      <div className="mb-6 flex flex-wrap gap-2">
        <Badge variant="secondary">{claim.approvalStatus}</Badge>
        <Badge variant="outline">Posting: {claim.postingStatus}</Badge>
        <Badge variant="outline">Reimbursement: {claim.reimbursementStatus}</Badge>
        <Badge variant="outline">
          Total {fromMinorUnits(claim.totalMinor, claim.claimCurrency)}
        </Badge>
      </div>

      {claim.postedJournalId ? (
        <Alert className="mb-6">
          <AlertTitle>Posted</AlertTitle>
          <AlertDescription>
            Accrual journal {claim.postedJournalId}. Bank reimbursement is handled in EM-07.
          </AlertDescription>
        </Alert>
      ) : null}

      {claim.description ? (
        <p className="mb-6 text-sm text-muted-foreground">{claim.description}</p>
      ) : null}

      <div className="mb-8">
        <h2 className="mb-3 text-base font-semibold">Lines</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Merchant</TableHead>
              <TableHead className="text-right">Gross</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {claim.lines.map((line) => (
              <TableRow key={line.id || String(line.lineNo)}>
                <TableCell>{line.lineNo}</TableCell>
                <TableCell>{line.expenseDate}</TableCell>
                <TableCell>{line.description}</TableCell>
                <TableCell>{line.merchantName ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {fromMinorUnits(line.grossMinor, line.currencyCode)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <DocumentRecordPanel entityType="expense_claim" entityId={claim.id} audience="internal" />
    </>
  );
}
