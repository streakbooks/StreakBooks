import { createFileRoute, notFound } from "@tanstack/react-router";
import { isNpSectionKey, type NpSectionKey } from "@/lib/nonprofit/sections";
import { NonprofitPage } from "@/screens/nonprofit/workspace";

export const Route = createFileRoute("/_authenticated/nonprofit/$section")({
  head: ({ params }) => ({
    meta: [{ title: `${params.section} — Nonprofit — StreakBooks` }],
  }),
  beforeLoad: ({ params }) => {
    if (!isNpSectionKey(params.section) || params.section === "overview") throw notFound();
  },
  component: NonprofitSectionRoute,
  staticData: { moduleId: "nonprofit", pageKind: "list" },
});

function NonprofitSectionRoute() {
  const { section } = Route.useParams();
  return <NonprofitPage sectionKey={section as NpSectionKey} />;
}
