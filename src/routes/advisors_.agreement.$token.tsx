import { createFileRoute } from "@tanstack/react-router";
import { AdvisorsAgreementPage } from "@/screens/advisors/agreement";
import { AdvisorPublicLayout } from "@/components/advisors/AdvisorPublicLayout";

export const Route = createFileRoute("/advisors_/agreement/$token")({
  head: () => ({
    meta: [{ title: "Agreement — StreakBooks Advisors" }],
  }),
  component: AdvisorsAgreementRoute,
});

function AdvisorsAgreementRoute() {
  const { token } = Route.useParams();
  return (
    <AdvisorPublicLayout>
      <AdvisorsAgreementPage token={token} />
    </AdvisorPublicLayout>
  );
}
