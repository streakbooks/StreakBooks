import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import { ExpenseManagementLoadingShell } from "@/components/expenses/ExpenseManagementLoadingShell";
import { ExpenseManagementSubnav } from "@/components/expenses/ExpenseManagementSubnav";
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
import { useCan } from "@/hooks/use-can";
import { fromMinorUnits } from "@/lib/accounting/money";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { listExpenseClaims } from "@/lib/expenses/expenses.functions";
import type { Permission } from "@/lib/permissions";

export function ExpenseManagementBudgetsPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canView =
    can("expenses.view" as Permission) ||
    can("expenses.approve" as Permission) ||
    can("expenses.audit" as Permission) ||
    can("expenses.admin" as Permission);
  const fetchClaims = useServerFn(listExpenseClaims);

  const claimsQ = useQuery({
    queryKey: ["expense-claims", company?.id, "budgets-bridge"],
    queryFn: () =>
      fetchClaims({
        data: {
          companyId: company!.id,
          scope: "all",
          approvalStatuses: ["submitted", "in_review", "approved"],
        },
      }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });

  const openTotal = useMemo(() => {
    const rows = claimsQ.data ?? [];
    return rows.reduce((sum, claim) => sum + claim.totalMinor, 0);
  }, [claimsQ.data]);

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canView) {
    return (
      <>
        <PageHeader title="Budgets" />
        <ExpenseManagementSubnav current="budgets" />
        <EmptyState
          title="No access"
          description="Ask an administrator for expenses.view or budgets.view."
        />
      </>
    );
  }
  if (claimsQ.isLoading) {
    return <ExpenseManagementLoadingShell title="Budgets" current="budgets" />;
  }
  if (claimsQ.isError) {
    return (
      <>
        <PageHeader title="Budgets" description="Expense Management" />
        <ExpenseManagementSubnav current="budgets" />
        <ErrorState
          title="Could not load claim commitments"
          description={friendlyAuthError(claimsQ.error)}
          onRetry={() => claimsQ.refetch()}
        />
      </>
    );
  }

  const currency = company.base_currency ?? "USD";
  const rows = claimsQ.data ?? [];

  return (
    <>
      <PageHeader
        title="Budgets"
        description="Open claim commitments that should be considered in budget control. Full budget envelopes live in the Budgets module."
        actions={
          <Button asChild size="sm">
            <Link to="/budgets">Open Budgets module</Link>
          </Button>
        }
      />
      <ExpenseManagementSubnav current="budgets" />

      <div className="mb-6 flex flex-wrap gap-2">
        <Badge variant="secondary">{rows.length} open claims</Badge>
        <Badge variant="outline">
          Commitment {fromMinorUnits(openTotal, currency)} {currency}
        </Badge>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No open claim commitments"
          description="Submitted, in-review and approved claims will appear here as budget exposure."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Claim</TableHead>
              <TableHead>Approval</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((claim) => (
              <TableRow key={claim.id}>
                <TableCell>
                  <div className="font-medium">{claim.claimNumber}</div>
                  <div className="text-sm text-muted-foreground">{claim.title}</div>
                  <Button asChild variant="link" className="h-auto px-0" size="sm">
                    <Link
                      to="/expense-management/claims/$claimId"
                      params={{ claimId: claim.id }}
                    >
                      Open
                    </Link>
                  </Button>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{claim.approvalStatus}</Badge>
                </TableCell>
                <TableCell>{claim.claimDate}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {fromMinorUnits(claim.totalMinor, claim.claimCurrency)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
