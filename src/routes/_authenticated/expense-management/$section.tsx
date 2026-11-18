import { createFileRoute, notFound } from "@tanstack/react-router";
import { z } from "zod";
import {
  isExpenseManagementSectionKey,
  type ExpenseManagementSectionKey,
} from "@/lib/expenses/sections";
import { ExpenseManagementSectionPage } from "@/screens/expense-management/section";

export const Route = createFileRoute("/_authenticated/expense-management/$section")({
  validateSearch: (search: Record<string, unknown>) =>
    z
      .object({
        create: z.boolean().optional(),
      })
      .parse({
        create:
          search["create"] === true ||
          search["create"] === "true" ||
          search["create"] === "1" ||
          search["create"] === 1
            ? true
            : undefined,
      }),
  head: ({ params }) => ({
    meta: [
      {
        title: `${formatSectionTitle(params.section)} — Expenses — LinkBooks`,
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
  const { create } = Route.useSearch();
  return (
    <ExpenseManagementSectionPage
      sectionKey={section as ExpenseManagementSectionKey}
      forceCreate={Boolean(create)}
    />
  );
}

function formatSectionTitle(section: string): string {
  return section
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
