import { createFileRoute } from "@tanstack/react-router";
import { requireRouteUuid } from "@/lib/navigation/route-params";
import { HrEmployeeDetailPage } from "@/screens/hr/employee-detail";

export const Route = createFileRoute("/_authenticated/hr/employees/$employeeId")({
  beforeLoad: ({ params }) => {
    requireRouteUuid(params.employeeId);
  },
  head: () => ({
    meta: [
      { title: "HR employee — StreakBooks" },
      {
        name: "description",
        content: "HR employee profile, organisation assignment and position history.",
      },
    ],
  }),
  component: HrEmployeeDetailRoute,
  staticData: {
    moduleId: "hr",
    pageKind: "record",
  },
});

function HrEmployeeDetailRoute() {
  const { employeeId } = Route.useParams();
  return <HrEmployeeDetailPage employeeId={employeeId} />;
}
