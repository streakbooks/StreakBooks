import { Link } from "@tanstack/react-router";
import { ExpenseManagementSubnav } from "@/components/expenses/ExpenseManagementSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, LoadingState, PageHeader } from "@/components/common/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import {
  expenseManagementSection,
  type ExpenseManagementSectionKey,
} from "@/lib/expenses/sections";
import type { Permission } from "@/lib/permissions";
import { ExpenseManagementClaimsPage } from "@/screens/expense-management/claims";
import { ExpenseManagementReceiptsPage } from "@/screens/expense-management/receipts";
import { ExpenseManagementSettingsPage } from "@/screens/expense-management/settings";

const LEGACY_LINKS: Partial<
  Record<ExpenseManagementSectionKey, { label: string; to: string }>
> = {
  approvals: { label: "Review legacy submitted claims", to: "/purchases/employee-expenses" },
  reimbursements: {
    label: "Legacy reimbursements live on employee expenses",
    to: "/purchases/employee-expenses",
  },
  budgets: { label: "Open Budgets module", to: "/budgets" },
};

export function ExpenseManagementSectionPage({
  sectionKey,
}: {
  sectionKey: ExpenseManagementSectionKey;
}) {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const section = expenseManagementSection(sectionKey);

  if (sectionKey === "settings") {
    return <ExpenseManagementSettingsPage />;
  }
  if (sectionKey === "my-expenses") {
    return <ExpenseManagementClaimsPage mode="my-expenses" />;
  }
  if (sectionKey === "claims") {
    return <ExpenseManagementClaimsPage mode="claims" />;
  }
  if (sectionKey === "receipts") {
    return <ExpenseManagementReceiptsPage />;
  }

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }

  const allowed = section.anyOf.some((permission) => can(permission as Permission));
  if (!allowed) {
    return (
      <>
        <PageHeader title={section.label} description="Expense Management" />
        <ExpenseManagementSubnav current={sectionKey} />
        <EmptyState
          title="No access"
          description="Your role cannot open this Expense Management section."
        />
      </>
    );
  }

  const legacy = LEGACY_LINKS[sectionKey];

  return (
    <>
      <PageHeader
        title={section.label}
        description="Part of the Expense Management module."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/expense-management">Back to overview</Link>
          </Button>
        }
      />
      <ExpenseManagementSubnav current={sectionKey} />
      <Alert className="mb-6">
        <AlertTitle>{section.label} is scheduled for {section.batch}</AlertTitle>
        <AlertDescription>
          This tab is wired into navigation with permission checks. End-to-end workflows for this
          area are delivered in {section.batch}. No simulated actions are offered here.
        </AlertDescription>
      </Alert>
      <EmptyState
        title={`${section.label} workspace ready`}
        description={
          legacy
            ? "Use the linked live path below until this batch lands."
            : "Foundation schema and permissions are in place. Feature implementation continues in later batches."
        }
        action={
          legacy ? (
            <Button asChild>
              <Link to={legacy.to}>{legacy.label}</Link>
            </Button>
          ) : undefined
        }
      />
    </>
  );
}
