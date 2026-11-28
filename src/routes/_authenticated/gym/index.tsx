import { createFileRoute } from "@tanstack/react-router";
import { GymPage } from "@/screens/gym/workspace";

export const Route = createFileRoute("/_authenticated/gym/")({
  head: () => ({
    meta: [
      { title: "Gym & Fitness — StreakBooks" },
      {
        name: "description",
        content: "Membership, scheduling and deferred revenue inside the StreakBooks ledger.",
      },
    ],
  }),
  component: GymOverviewRoute,
  staticData: { moduleId: "gym", pageKind: "dashboard" },
});

function GymOverviewRoute() {
  return <GymPage sectionKey="overview" />;
}
