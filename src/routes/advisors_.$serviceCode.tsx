import { createFileRoute } from "@tanstack/react-router";
import { AdvisorsServiceSelectedPage } from "@/screens/advisors/service-selected";

export const Route = createFileRoute("/advisors_/$serviceCode")({
  head: ({ params }) => ({
    meta: [
      {
        title:
          params.serviceCode === "coaching"
            ? "We coach you — StreakBooks Advisors"
            : "We do your books — StreakBooks Advisors",
      },
      {
        name: "description",
        content:
          "Review StreakBooks Advisors plans and pricing after choosing bookkeeping or coaching support.",
      },
    ],
  }),
  component: AdvisorsServiceRoute,
});

function AdvisorsServiceRoute() {
  const { serviceCode } = Route.useParams();
  return <AdvisorsServiceSelectedPage serviceCode={serviceCode} />;
}
