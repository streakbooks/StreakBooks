import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExpenseManagementSubnav } from "@/components/expenses/ExpenseManagementSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { getExpenseManagementOverview } from "@/lib/expenses/expenses.functions";
import type { Permission } from "@/lib/permissions";

function KpiCard({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: number;
  hint: string;
  href?:
    | {
        kind: "absolute";
        to: "/purchases/employee-expenses" | "/purchases/expenses" | "/banking/spend-money";
      }
    | { kind: "section"; section: string };
}) {
  const body = (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
  if (!href) return body;
  if (href.kind === "absolute") {
    return (
      <Link
        to={href.to}
        className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {body}
      </Link>
    );
  }
  return (
    <Link
      to="/expense-management/$section"
      params={{ section: href.section }}
      className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {body}
    </Link>
  );
}

export function ExpenseManagementOverviewPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canOpen =
    can("expenses.view" as Permission) ||
    can("expenses.submit" as Permission) ||
    can("expenses.approve" as Permission) ||
    can("expenses.admin" as Permission);
  const fetchOverview = useServerFn(getExpenseManagementOverview);
  const overview = useQuery({
    queryKey: ["expense-management-overview", company?.id],
    queryFn: () => fetchOverview({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canOpen,
    retry: false,
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canOpen) {
    return (
      <ListWorkspace title="Expenses" description="Claims, receipts, approvals and reimbursements.">
        <EmptyState
          title="No expense access"
          description="Ask an administrator for expenses.submit or expenses.view."
        />
      </ListWorkspace>
    );
  }
  if (overview.isLoading) {
    return (
      <ListWorkspace
        title="Expenses"
        description="Claims, receipts, approvals and reimbursements."
        subnav={<ExpenseManagementSubnav current="overview" />}
      >
        <LoadingState />
      </ListWorkspace>
    );
  }
  if (overview.isError) {
    return (
      <ErrorState
        title="Could not load expense overview"
        description={friendlyAuthError(overview.error)}
        onRetry={() => overview.refetch()}
      />
    );
  }

  if (!overview.data) {
    return (
      <ListWorkspace
        title="Expenses"
        description="Claims, receipts, approvals and reimbursements."
        subnav={<ExpenseManagementSubnav current="overview" />}
      >
        <LoadingState />
      </ListWorkspace>
    );
  }

  const { kpis, migrationMessage } = overview.data;
  const canManagePolicies =
    can("expenses.manage_policies" as Permission) || can("expenses.admin" as Permission);

  return (
    <ListWorkspace
      title="Expenses"
      description="Top-level module for employee and contractor expenses."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link
              to="/expense-management/$section"
              params={{ section: "my-expenses" }}
              search={{ create: true }}
            >
              New expense claim
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/banking/spend-money" search={{ returnTo: "/expense-management" }}>
              Spend money
            </Link>
          </Button>
          {canManagePolicies ? (
            <Button asChild variant="outline" size="sm">
              <Link to="/expense-management/$section" params={{ section: "settings" }}>
                Settings
              </Link>
            </Button>
          ) : null}
        </div>
      }
      subnav={<ExpenseManagementSubnav current="overview" />}
    >
      {migrationMessage ? (
        <Alert className="mb-6">
          <AlertTitle>Foundation migration pending</AlertTitle>
          <AlertDescription>{migrationMessage}</AlertDescription>
        </Alert>
      ) : null}

      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Pending legacy claims"
          value={kpis.legacySubmittedClaims}
          hint="Legacy Purchases list — submit new claims from My Expenses"
          href={{ kind: "absolute", to: "/purchases/employee-expenses" }}
        />
        <KpiCard
          label="Reimbursed legacy claims"
          value={kpis.legacyReimbursedClaims}
          hint="Already paid through the MVP approve-and-pay flow"
          href={{ kind: "absolute", to: "/purchases/employee-expenses" }}
        />
        <KpiCard
          label="Rejected legacy claims"
          value={kpis.legacyRejectedClaims}
          hint="Returned or declined MVP claims"
          href={{ kind: "absolute", to: "/purchases/employee-expenses" }}
        />
        <KpiCard
          label="Posted spend-money expenses"
          value={kpis.directExpensesPosted}
          hint={`${kpis.directExpensesDraft} draft direct expenses remain`}
          href={{ kind: "absolute", to: "/banking/spend-money" }}
        />
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="EM claims"
          value={kpis.emClaimsTotal}
          hint={
            kpis.emFoundationAvailable
              ? "Rows in the new expense_claims table"
              : "Unavailable until migration 20261107120000 is applied"
          }
          href={{ kind: "section", section: "claims" }}
        />
        <KpiCard
          label="Pending EM approvals"
          value={kpis.emPendingApproval}
          hint="Submitted or in review"
          href={{ kind: "section", section: "approvals" }}
        />
        <KpiCard
          label="Approved EM claims"
          value={kpis.emApproved}
          hint="Approved and ready for posting or reimbursement"
          href={{ kind: "section", section: "claims" }}
        />
        <KpiCard
          label="Awaiting reimbursement"
          value={kpis.emAwaitingReimbursement}
          hint="Eligible, awaiting payment, or payment initiated"
          href={{ kind: "section", section: "reimbursements" }}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Action centre</CardTitle>
          <CardDescription>
            Live counts come from permission-scoped database queries. Advanced workflows arrive in
            future Expenses updates.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant="secondary" size="sm">
            <Link
              to="/expense-management/$section"
              params={{ section: "my-expenses" }}
              search={{ create: true }}
            >
              New expense claim
            </Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link to="/expense-management/$section" params={{ section: "my-expenses" }}>
              Open My Expenses
            </Link>
          </Button>
          <Button asChild variant="secondary" size="sm">
            <Link to="/banking/spend-money" search={{ returnTo: "/expense-management" }}>
              Record spend money
            </Link>
          </Button>
        </CardContent>
      </Card>
    </ListWorkspace>
  );
}
