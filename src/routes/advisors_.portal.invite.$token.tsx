import { createFileRoute } from "@tanstack/react-router";
import { AdvisorsPortalInvitePage } from "@/screens/advisors/portal-invite";
import { AdvisorPublicLayout } from "@/components/advisors/AdvisorPublicLayout";

export const Route = createFileRoute("/advisors_/portal/invite/$token")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Accept Advisors portal invite — StreakBooks" }],
  }),
  component: function AdvisorsPortalInviteRoute() {
    const { token } = Route.useParams();
    return (
      <AdvisorPublicLayout>
        <AdvisorsPortalInvitePage token={token} />
      </AdvisorPublicLayout>
    );
  },
});
