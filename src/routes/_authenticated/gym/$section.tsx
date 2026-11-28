import { createFileRoute, notFound } from "@tanstack/react-router";
import { isGymSectionKey, type GymSectionKey } from "@/lib/gym/sections";
import { GymPage } from "@/screens/gym/workspace";

export const Route = createFileRoute("/_authenticated/gym/$section")({
  head: ({ params }) => ({
    meta: [{ title: `${params.section} — Gym & Fitness — StreakBooks` }],
  }),
  beforeLoad: ({ params }) => {
    if (!isGymSectionKey(params.section) || params.section === "overview") throw notFound();
  },
  component: GymSectionRoute,
  staticData: { moduleId: "gym", pageKind: "list" },
});

function GymSectionRoute() {
  const { section } = Route.useParams();
  return <GymPage sectionKey={section as GymSectionKey} />;
}
