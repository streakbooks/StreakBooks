import { createFileRoute } from "@tanstack/react-router";
import { AdvisorsServiceSelectedPage } from "@/screens/advisors/service-selected";

export const Route = createFileRoute("/advisors_/$serviceCode")({
  head: ({ params }) => ({
    meta: [
      {
        title:
          params.serviceCode === "coaching"
            ? "We coach you — LinkBooks Advisors"
            : "We do your books — LinkBooks Advisors",
      },
      {
        name: "description",
        content:
          "Review LinkBooks Advisors plans and pricing after choosing bookkeeping or coaching support.",
      },
    ],
  }),
  component: AdvisorsServiceRoute,
});

function AdvisorsServiceRoute() {
  const { serviceCode } = Route.useParams();
  return <AdvisorsServiceSelectedPage serviceCode={serviceCode} />;
}
