import { createFileRoute, notFound } from "@tanstack/react-router";
import { isPmSectionKey, type PmSectionKey } from "@/lib/property-management/sections";
import { PmSectionPage } from "@/screens/property-management/section";

export const Route = createFileRoute("/_authenticated/property-management/$section")({
  head: ({ params }) => ({
    meta: [
      {
        title: `${formatSectionTitle(params.section)} — Property Management — StreakBooks`,
      },
    ],
  }),
  beforeLoad: ({ params }) => {
    if (!isPmSectionKey(params.section) || params.section === "overview") {
      throw notFound();
    }
  },
  component: PmSectionRoute,
  staticData: {
    moduleId: "property-management",
    pageKind: "list",
  },
});

function PmSectionRoute() {
  const { section } = Route.useParams();
  return <PmSectionPage sectionKey={section as PmSectionKey} />;
}

function formatSectionTitle(section: string): string {
  return section
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
