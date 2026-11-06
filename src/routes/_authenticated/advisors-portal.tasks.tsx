import { createFileRoute } from "@tanstack/react-router";
import { AdvisorsPortalTasksPage } from "@/screens/advisors/portal-tasks";

export const Route = createFileRoute("/_authenticated/advisors-portal/tasks")({
  head: () => ({
    meta: [{ title: "Tasks — Advisors portal" }],
  }),
  component: AdvisorsPortalTasksPage,
});
