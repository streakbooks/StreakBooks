import { createFileRoute } from "@tanstack/react-router";
import { AdvisorsManageAppointmentPage } from "@/screens/advisors/manage-appointment";

export const Route = createFileRoute("/advisors_/manage/$manageToken")({
  head: () => ({
    meta: [{ title: "Manage consultation — LinkBooks Advisors" }],
  }),
  component: AdvisorsManageRoute,
});

function AdvisorsManageRoute() {
  const { manageToken } = Route.useParams();
  return <AdvisorsManageAppointmentPage manageToken={manageToken} />;
}
