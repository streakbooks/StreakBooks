import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AdvisorsPortalSubnav } from "@/components/advisors/AdvisorsPortalSubnav";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { listAdvisorsPortalAppointments } from "@/lib/advisors/portal.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";

export function AdvisorsPortalAppointmentsPage() {
  const list = useServerFn(listAdvisorsPortalAppointments);
  const query = useQuery({
    queryKey: ["advisors-portal-appointments"],
    queryFn: () => list(),
    retry: false,
  });

  if (query.isPending) return <LoadingState />;
  if (query.isError) {
    return (
      <main className="mx-auto max-w-5xl space-y-6 p-6">
        <PageHeader
          title="Appointments"
          description="Consultations linked to your Advisors email."
        />
        <ErrorState
          title="Appointments unavailable"
          description={friendlyAuthError(query.error)}
          onRetry={() => void query.refetch()}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <PageHeader
        title="Appointments"
        description="View and manage consultations. Reminder emails are scheduled automatically."
      />
      <AdvisorsPortalSubnav />
      {query.data.length === 0 ? (
        <EmptyState
          title="No appointments yet"
          description="Book a consultation from the public Advisors booking page."
        />
      ) : (
        <ul className="space-y-3">
          {query.data.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4"
            >
              <div>
                <p className="font-medium">{new Date(item.startsAt).toLocaleString()}</p>
                <p className="text-sm text-muted-foreground">
                  {item.advisorName || "Advisor"}
                  {item.serviceCode ? ` · ${item.serviceCode}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{item.status}</Badge>
                <Link
                  to="/advisors/manage/$manageToken"
                  params={{ manageToken: item.manageToken }}
                  className="text-sm text-primary underline-offset-4 hover:underline"
                >
                  Manage
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
