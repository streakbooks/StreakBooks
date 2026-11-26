import { createFileRoute } from "@tanstack/react-router";
import { AdvisorsProposalPage } from "@/screens/advisors/proposal";
import { AdvisorPublicLayout } from "@/components/advisors/AdvisorPublicLayout";

export const Route = createFileRoute("/advisors_/proposal/$token")({
  head: () => ({
    meta: [{ title: "Proposal — StreakBooks Advisors" }],
  }),
  component: AdvisorsProposalRoute,
});

function AdvisorsProposalRoute() {
  const { token } = Route.useParams();
  return (
    <AdvisorPublicLayout>
      <AdvisorsProposalPage token={token} />
    </AdvisorPublicLayout>
  );
}
