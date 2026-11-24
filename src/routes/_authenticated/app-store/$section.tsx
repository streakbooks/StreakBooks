import { createFileRoute, notFound } from "@tanstack/react-router";
import { isAppStoreSectionKey, type AppStoreSectionKey } from "@/lib/app-store/sections";
import { AppStoreSectionPage } from "@/screens/app-store/section";

export const Route = createFileRoute("/_authenticated/app-store/$section")({
  head: ({ params }) => ({
    meta: [
      {
        title: `${formatSectionTitle(params.section)} — App Store — StreakBooks`,
      },
    ],
  }),
  beforeLoad: ({ params }) => {
    if (!isAppStoreSectionKey(params.section) || params.section === "overview") {
      throw notFound();
    }
  },
  component: AppStoreSectionRoute,
});

function AppStoreSectionRoute() {
  const { section } = Route.useParams();
  return <AppStoreSectionPage sectionKey={section as AppStoreSectionKey} />;
}

function formatSectionTitle(section: string): string {
  return section
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
