import { createFileRoute, notFound } from "@tanstack/react-router";
import {
  isExpenseManagementSectionKey,
  type ExpenseManagementSectionKey,
} from "@/lib/expenses/sections";
import { ExpenseManagementSectionPage } from "@/screens/expense-management/section";

export const Route = createFileRoute("/_authenticated/expense-management/$section")({
  head: ({ params }) => ({
    meta: [
      {
        title: `${formatSectionTitle(params.section)} — Expense Management — LinkBooks`,
      },
    ],
  }),
  beforeLoad: ({ params }) => {
    if (!isExpenseManagementSectionKey(params.section) || params.section === "overview") {
      throw notFound();
    }
  },
  component: ExpenseManagementSectionRoute,
});

function ExpenseManagementSectionRoute() {
  const { section } = Route.useParams();
  return <ExpenseManagementSectionPage sectionKey={section as ExpenseManagementSectionKey} />;
}

function formatSectionTitle(section: string): string {
  return section
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
