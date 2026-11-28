import { createFileRoute, notFound } from "@tanstack/react-router";
import { isRealEstateRouteSection, realEstateRouteSearch } from "@/lib/real-estate/route-search";
import { RealEstatePage } from "@/screens/real-estate/workspace";

export const Route = createFileRoute("/_authenticated/real-estate/$section")({
  validateSearch: realEstateRouteSearch,
  head: ({ params }) => ({
    meta: [{ title: `${params.section} — Real Estate — StreakBooks` }],
  }),
  beforeLoad: ({ params }) => {
    if (!isRealEstateRouteSection(params.section) || params.section === "overview")
      throw notFound();
  },
  component: RealEstateSectionRoute,
  staticData: { moduleId: "real-estate", pageKind: "list" },
});

function RealEstateSectionRoute() {
  const { section } = Route.useParams();
  const search = Route.useSearch();
  return <RealEstatePage sectionKey={section} search={search} />;
}
