import { createFileRoute, notFound } from "@tanstack/react-router";
import { isCrmSectionKey, type CrmSectionKey } from "@/lib/crm/sections";
import { CrmSectionPage } from "@/screens/crm/section";

export const Route = createFileRoute("/_authenticated/crm/$section")({
  head: ({ params }) => ({
    meta: [
      {
        title: `${formatSectionTitle(params.section)} — CRM — StreakBooks`,
      },
    ],
  }),
  beforeLoad: ({ params }) => {
    if (!isCrmSectionKey(params.section) || params.section === "overview") {
      throw notFound();
    }
  },
  component: CrmSectionRoute,
  staticData: {
    moduleId: "crm",
    pageKind: "list",
  },
});

function CrmSectionRoute() {
  const { section } = Route.useParams();
  return <CrmSectionPage sectionKey={section as CrmSectionKey} />;
}

function formatSectionTitle(section: string): string {
  return section
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
