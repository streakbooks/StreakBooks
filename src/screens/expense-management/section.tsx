import { lazy, Suspense, type ReactNode } from "react";
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

const ExpenseManagementApprovalsPage = lazy(() =>
  import("@/screens/expense-management/approvals").then((m) => ({
    default: m.ExpenseManagementApprovalsPage,
  })),
);
const ExpenseManagementCashAdvancesPage = lazy(() =>
  import("@/screens/expense-management/cash-advances").then((m) => ({
    default: m.ExpenseManagementCashAdvancesPage,
  })),
);
const ExpenseManagementClaimsPage = lazy(() =>
  import("@/screens/expense-management/claims").then((m) => ({
    default: m.ExpenseManagementClaimsPage,
  })),
);
const ExpenseManagementCorporateCardsPage = lazy(() =>
  import("@/screens/expense-management/corporate-cards").then((m) => ({
    default: m.ExpenseManagementCorporateCardsPage,
  })),
);
const ExpenseManagementMileagePage = lazy(() =>
  import("@/screens/expense-management/mileage").then((m) => ({
    default: m.ExpenseManagementMileagePage,
  })),
);
const ExpenseManagementPettyCashPage = lazy(() =>
  import("@/screens/expense-management/petty-cash").then((m) => ({
    default: m.ExpenseManagementPettyCashPage,
  })),
);
const ExpenseManagementReceiptsPage = lazy(() =>
  import("@/screens/expense-management/receipts").then((m) => ({
    default: m.ExpenseManagementReceiptsPage,
  })),
);
const ExpenseManagementReimbursementsPage = lazy(() =>
  import("@/screens/expense-management/reimbursements").then((m) => ({
    default: m.ExpenseManagementReimbursementsPage,
  })),
);
const ExpenseManagementSettingsPage = lazy(() =>
  import("@/screens/expense-management/settings").then((m) => ({
    default: m.ExpenseManagementSettingsPage,
  })),
);
const ExpenseManagementSpendingRequestsPage = lazy(() =>
  import("@/screens/expense-management/spending-requests").then((m) => ({
    default: m.ExpenseManagementSpendingRequestsPage,
  })),
);
const ExpenseManagementTravelPage = lazy(() =>
  import("@/screens/expense-management/travel").then((m) => ({
    default: m.ExpenseManagementTravelPage,
  })),
);

const LEGACY_LINKS: Partial<
  Record<ExpenseManagementSectionKey, { label: string; to: string }>
> = {
  budgets: { label: "Open Budgets module", to: "/budgets" },
};

function SectionSuspense({ children }: { children: ReactNode }) {
  return <Suspense fallback={<LoadingState />}>{children}</Suspense>;
}

export function ExpenseManagementSectionPage({
  sectionKey,
}: {
  sectionKey: ExpenseManagementSectionKey;
}) {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const section = expenseManagementSection(sectionKey);

  if (sectionKey === "settings") {
    return (
      <SectionSuspense>
        <ExpenseManagementSettingsPage />
      </SectionSuspense>
    );
  }
  if (sectionKey === "my-expenses") {
    return (
      <SectionSuspense>
        <ExpenseManagementClaimsPage mode="my-expenses" />
      </SectionSuspense>
    );
  }
  if (sectionKey === "claims") {
    return (
      <SectionSuspense>
        <ExpenseManagementClaimsPage mode="claims" />
      </SectionSuspense>
    );
  }
  if (sectionKey === "receipts") {
    return (
      <SectionSuspense>
        <ExpenseManagementReceiptsPage />
      </SectionSuspense>
    );
  }
  if (sectionKey === "approvals") {
    return (
      <SectionSuspense>
        <ExpenseManagementApprovalsPage />
      </SectionSuspense>
    );
  }
  if (sectionKey === "spending-requests") {
    return (
      <SectionSuspense>
        <ExpenseManagementSpendingRequestsPage />
      </SectionSuspense>
    );
  }
  if (sectionKey === "reimbursements") {
    return (
      <SectionSuspense>
        <ExpenseManagementReimbursementsPage />
      </SectionSuspense>
    );
  }
  if (sectionKey === "mileage") {
    return (
      <SectionSuspense>
        <ExpenseManagementMileagePage />
      </SectionSuspense>
    );
  }
  if (sectionKey === "cash-advances") {
    return (
      <SectionSuspense>
        <ExpenseManagementCashAdvancesPage />
      </SectionSuspense>
    );
  }
  if (sectionKey === "petty-cash") {
    return (
      <SectionSuspense>
        <ExpenseManagementPettyCashPage />
      </SectionSuspense>
    );
  }
  if (sectionKey === "travel") {
    return (
      <SectionSuspense>
        <ExpenseManagementTravelPage />
      </SectionSuspense>
    );
  }
  if (sectionKey === "corporate-cards") {
    return (
      <SectionSuspense>
        <ExpenseManagementCorporateCardsPage />
      </SectionSuspense>
    );
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
