import { createFileRoute } from "@tanstack/react-router";
import { ManualJournalPanel, RecurringJournalPanel } from "@/components/create-new/JournalPanels";

export const Route = createFileRoute("/_authenticated/accounting/journals/new")({
  validateSearch: (search: Record<string, unknown>): { mode?: "post" | "template" } => ({
    mode: search["mode"] === "template" ? "template" : "post",
  }),
  head: ({ match }) => ({
    meta: [
      {
        title:
          match.search.mode === "template"
            ? "New recurring journal — StreakBooks"
            : "New manual journal — StreakBooks",
      },
    ],
  }),
  component: JournalNewRoute,
});

function JournalNewRoute() {
  const { mode } = Route.useSearch();
  return mode === "template" ? <RecurringJournalPanel /> : <ManualJournalPanel />;
}
