import { createFileRoute } from "@tanstack/react-router";
import { AdvisorsManageAppointmentPage } from "@/screens/advisors/manage-appointment";
import { AdvisorPublicLayout } from "@/components/advisors/AdvisorPublicLayout";

export const Route = createFileRoute("/advisors_/manage/$manageToken")({
  head: () => ({
    meta: [{ title: "Manage consultation — StreakBooks Advisors" }],
  }),
  component: AdvisorsManageRoute,
});

function AdvisorsManageRoute() {
  const { manageToken } = Route.useParams();
  return (
    <AdvisorPublicLayout>
      <AdvisorsManageAppointmentPage manageToken={manageToken} />
    </AdvisorPublicLayout>
  );
}
