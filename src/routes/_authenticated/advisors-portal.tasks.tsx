import { createFileRoute } from "@tanstack/react-router";
import { AdvisorsPortalTasksPage } from "@/screens/advisors/portal-tasks";

export const Route = createFileRoute("/_authenticated/advisors-portal/tasks")({
  head: () => ({
    meta: [{ title: "Tasks — Advisors portal" }],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    status: typeof search.status === "string" && /^[a-z][a-z0-9_-]{0,39}$/i.test(search.status)
      ? search.status
      : undefined,
  }),
  component: AdvisorsPortalTasksPage,
});
