import { createFileRoute } from "@tanstack/react-router";
import { AdvisorsAgreementPage } from "@/screens/advisors/agreement";

export const Route = createFileRoute("/advisors_/agreement/$token")({
  head: () => ({
    meta: [{ title: "Agreement — StreakBooks Advisors" }],
  }),
  component: AdvisorsAgreementRoute,
});

function AdvisorsAgreementRoute() {
  const { token } = Route.useParams();
  return <AdvisorsAgreementPage token={token} />;
}
