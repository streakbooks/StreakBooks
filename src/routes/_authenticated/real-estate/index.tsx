import { createFileRoute } from "@tanstack/react-router";
import { realEstateRouteSearch } from "@/lib/real-estate/route-search";
import { RealEstatePage } from "@/screens/real-estate/workspace";

export const Route = createFileRoute("/_authenticated/real-estate/")({
  validateSearch: realEstateRouteSearch,
  head: () => ({
    meta: [
      { title: "Real Estate — StreakBooks" },
      {
        name: "description",
        content:
          "Property development inventory, reservations, collections and revenue recognition.",
      },
    ],
  }),
  component: RealEstateOverviewRoute,
  staticData: { moduleId: "real-estate", pageKind: "dashboard" },
});

function RealEstateOverviewRoute() {
  const search = Route.useSearch();
  return <RealEstatePage sectionKey="overview" search={search} />;
}
