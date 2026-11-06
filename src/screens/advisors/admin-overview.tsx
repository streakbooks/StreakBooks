import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AdvisorsSubnav } from "@/components/advisors/AdvisorsSubnav";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { getAdvisorsOverview } from "@/lib/advisors/management.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";

function Metric({ label, value, to }: { label: string; value: number; to: string }) {
  return (
    <Link
      to={to}
      className="rounded-xl border border-border/70 p-4 transition hover:border-primary/40 hover:bg-muted/30"
    >
      <p className="text-xs tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
    </Link>
  );
}

export function AdvisorsAdminOverviewPage() {
  const load = useServerFn(getAdvisorsOverview);
  const query = useQuery({
    queryKey: ["advisors-overview"],
    queryFn: () => load(),
    retry: false,
  });

  if (query.isPending) return <LoadingState />;
  if (query.isError) {
    return (
      <main className="mx-auto max-w-6xl space-y-6 p-6">
        <PageHeader title="Advisors overview" description="Inquiry and delivery console." />
        <ErrorState
          title="Overview unavailable"
          description={friendlyAuthError(query.error)}
          onRetry={() => void query.refetch()}
        />
      </main>
    );
  }

  const data = query.data;

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <PageHeader
        title="Advisors overview"
        description="Live counts from inquiries, conversations, consultations and clients. Only metrics backed by existing Advisors data are shown."
      />
      <AdvisorsSubnav />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="New inquiries" value={data.newInquiries} to="/advisors-admin/inquiries" />
        <Metric
          label="Open conversations"
          value={data.openConversations}
          to="/advisors-admin/conversations"
        />
        <Metric
          label="Handed-off chats"
          value={data.handedOffConversations}
          to="/advisors-admin/conversations"
        />
        <Metric
          label="Pending consultations"
          value={data.pendingConsultations}
          to="/advisors-admin/appointments"
        />
        <Metric
          label="Upcoming (7 days)"
          value={data.upcomingAppointments}
          to="/advisors-admin/appointments"
        />
        <Metric label="Active clients" value={data.activeClients} to="/advisors-admin/clients" />
        <Metric label="Prospects" value={data.prospectClients} to="/advisors-admin/clients" />
        <Metric
          label="Open proposals"
          value={data.openProposals}
          to="/advisors-admin/engagements"
        />
        <Metric
          label="Onboarding"
          value={data.onboardingEngagements}
          to="/advisors-admin/onboarding"
        />
        <Metric label="Pending billing" value={data.pendingBilling} to="/advisors-admin/billing" />
        <Metric label="Active billing" value={data.activeBilling} to="/advisors-admin/billing" />
        <Metric label="Workspaces" value={data.activeWorkspaces} to="/advisors-admin/workspaces" />
        <Metric label="Open tasks" value={data.openDeliveryTasks} to="/advisors-admin/workspaces" />
        <Metric
          label="Doc requests"
          value={data.openDocumentRequests}
          to="/advisors-admin/documents"
        />
        <Metric
          label="Portal linked"
          value={data.linkedPortalClients}
          to="/advisors-admin/clients"
        />
        <Metric
          label="Portal requests"
          value={data.openPortalRequests}
          to="/advisors-admin/clients"
        />
        <Metric
          label="Pending reminders"
          value={data.pendingReminders}
          to="/advisors-admin/appointments"
        />
        <Metric label="Active advisors" value={data.activeAdvisors} to="/advisors-admin/staff" />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-border/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Recent inquiries</h2>
            <Button asChild variant="outline" size="sm">
              <Link to="/advisors-admin/inquiries">View all</Link>
            </Button>
          </div>
          {data.recentInquiries.length === 0 ? (
            <EmptyState
              title="No inquiries yet"
              description="Chat lead captures and handoffs appear here."
            />
          ) : (
            <ul className="space-y-2">
              {data.recentInquiries.map((inquiry) => (
                <li
                  key={inquiry.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-border/50 px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium">{inquiry.name || inquiry.email || "Unnamed lead"}</p>
                    <p className="text-muted-foreground">
                      {inquiry.serviceCode}
                      {inquiry.businessName ? ` · ${inquiry.businessName}` : ""}
                    </p>
                  </div>
                  <span className="text-xs tracking-wide text-muted-foreground uppercase">
                    {inquiry.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-3 rounded-xl border border-border/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Upcoming consultations</h2>
            <Button asChild variant="outline" size="sm">
              <Link to="/advisors-admin/appointments">Manage</Link>
            </Button>
          </div>
          {data.upcoming.length === 0 ? (
            <EmptyState
              title="No upcoming bookings"
              description="Confirmed consultations scheduled from now onward appear here."
            />
          ) : (
            <ul className="space-y-2">
              {data.upcoming.map((appointment) => (
                <li
                  key={appointment.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-border/50 px-3 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium">{appointment.customerName}</p>
                    <p className="text-muted-foreground">
                      {appointment.serviceCode || "consultation"}
                      {appointment.businessName ? ` · ${appointment.businessName}` : ""}
                    </p>
                  </div>
                  <time className="text-xs text-muted-foreground" dateTime={appointment.startsAt}>
                    {new Date(appointment.startsAt).toLocaleString()}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
