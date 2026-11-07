import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExpenseManagementSubnav } from "@/components/expenses/ExpenseManagementSubnav";
import { DocumentRecordPanel } from "@/components/documents/DocumentRecordPanel";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/common/states";
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
import { fromMinorUnits } from "@/lib/accounting/money";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { getExpenseClaim } from "@/lib/expenses/expenses.functions";

export function ExpenseManagementClaimDetailPage({ claimId }: { claimId: string }) {
  const { company, isPending } = useActiveCompany();
  const fetchClaim = useServerFn(getExpenseClaim);
  const claimQ = useQuery({
    queryKey: ["expense-claim", company?.id, claimId],
    queryFn: () => fetchClaim({ data: { companyId: company!.id, claimId } }),
    enabled: Boolean(company?.id && claimId),
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (claimQ.isPending) return <LoadingState />;
  if (claimQ.isError) {
    return (
      <ErrorState
        title="Could not load claim"
        description={friendlyAuthError(claimQ.error)}
        onRetry={() => claimQ.refetch()}
      />
    );
  }

  const claim = claimQ.data;
  if (!claim) {
    return <EmptyState title="Claim not found" description="It may have been deleted." />;
  }

  return (
    <>
      <PageHeader
        title={claim.claimNumber}
        description={claim.title}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/purchases/expense-management/my-expenses">Back to My Expenses</Link>
          </Button>
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
