import { createFileRoute, notFound } from "@tanstack/react-router";
import { isHrSectionKey, type HrSectionKey } from "@/lib/hr/sections";
import { HrSectionPage } from "@/screens/hr/section";

export const Route = createFileRoute("/_authenticated/hr/$section")({
  head: ({ params }) => ({
    meta: [
      {
        title: `${formatSectionTitle(params.section)} — HR — LinkBooks`,
      },
    ],
  }),
  beforeLoad: ({ params }) => {
    if (!isHrSectionKey(params.section) || params.section === "overview") {
      throw notFound();
    }
  },
  component: HrSectionRoute,
  staticData: {
    moduleId: "hr",
    pageKind: "list",
  },
});

function HrSectionRoute() {
  const { section } = Route.useParams();
  return <HrSectionPage sectionKey={section as HrSectionKey} />;
}

function formatSectionTitle(section: string): string {
  return section
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
