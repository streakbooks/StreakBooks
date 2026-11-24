import { createFileRoute, notFound } from "@tanstack/react-router";
import {
  isDeveloperPortalSectionKey,
  type DeveloperPortalSectionKey,
} from "@/lib/app-store/sections";
import { DeveloperSectionPage } from "@/screens/developer/section";

export const Route = createFileRoute("/_authenticated/developer/$section")({
  head: ({ params }) => ({
    meta: [
      {
        title: `${formatSectionTitle(params.section)} — Developer — StreakBooks`,
      },
    ],
  }),
  beforeLoad: ({ params }) => {
    if (!isDeveloperPortalSectionKey(params.section) || params.section === "dashboard") {
      throw notFound();
    }
  },
  component: DeveloperSectionRoute,
});

function DeveloperSectionRoute() {
  const { section } = Route.useParams();
  return <DeveloperSectionPage sectionKey={section as DeveloperPortalSectionKey} />;
}

function formatSectionTitle(section: string): string {
  return section
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
