import { createFileRoute } from "@tanstack/react-router";
import { AdvisorsProposalPage } from "@/screens/advisors/proposal";

export const Route = createFileRoute("/advisors_/proposal/$token")({
  head: () => ({
    meta: [{ title: "Proposal — StreakBooks Advisors" }],
  }),
  component: AdvisorsProposalRoute,
});

function AdvisorsProposalRoute() {
  const { token } = Route.useParams();
  return <AdvisorsProposalPage token={token} />;
}
