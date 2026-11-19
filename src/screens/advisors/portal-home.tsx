import { Link } from "@tanstack/react-router";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AdvisorsPortalSubnav } from "@/components/advisors/AdvisorsPortalSubnav";
import { EmptyState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAdvisorsPortalHome } from "@/lib/advisors/portal.functions";
import { formatMinorAmount } from "@/lib/advisors/portal";
import { friendlyAuthError } from "@/lib/auth-helpers";

export function AdvisorsPortalHomePage() {
  const homeFn = useServerFn(getAdvisorsPortalHome);
  const query = useQuery({
    queryKey: ["advisors-portal-home"],
    queryFn: () => homeFn(),
    retry: false,
  });

  if (query.isPending) return <LoadingState />;
  if (query.isError) {
    return (
      <main className="mx-auto max-w-5xl space-y-6 p-6">
        <ListWorkspace title="Advisors portal" description="Your Advisors service account.">
          <QueryErrorState queries={[query]} title="Portal unavailable" />
        </ListWorkspace>
      </main>
    );
  }

  const home = query.data;
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <ListWorkspace
        title={`Hello, ${home.client.name || home.client.email}`}
        description="Plan, appointments, documents and messages for your Advisors engagement."
        subnav={<AdvisorsPortalSubnav />}
      >
        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-border p-4">
            <p className="text-sm text-muted-foreground">Open tasks</p>
            <p className="text-2xl font-semibold">{home.openTasks}</p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-sm text-muted-foreground">Document requests</p>
            <p className="text-2xl font-semibold">{home.openDocuments}</p>
          </div>
          <div className="rounded-lg border border-border p-4">
            <p className="text-sm text-muted-foreground">Unread notices</p>
            <p className="text-2xl font-semibold">{home.unreadNotifications}</p>
          </div>
        </section>

        <section className="space-y-3 rounded-lg border border-border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-medium">Your plan</h2>
            {home.engagement ? <Badge variant="secondary">{home.engagement.status}</Badge> : null}
          </div>
          {home.plan ? (
            <>
              <p className="font-medium">
                {home.plan.name}{" "}
                <span className="text-muted-foreground">
                  · {formatMinorAmount(home.plan.amountMinor, home.plan.currency)} /{" "}
                  {home.plan.cadence}
                </span>
              </p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {home.plan.inclusions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              {home.plan.sessionsIncluded != null ? (
                <p className="text-sm text-muted-foreground">
                  Coaching sessions completed: {home.coachingSessionsCompleted} /{" "}
                  {home.plan.sessionsIncluded} included
                </p>
              ) : null}
            </>
          ) : (
            <EmptyState
              title="No active plan"
              description="Your advisor will attach a plan after onboarding."
              action={
                <Button asChild size="sm" variant="outline">
                  <Link to="/advisors-portal/messages">Message your advisor</Link>
                </Button>
              }
            />
          )}
          {home.subscription ? (
            <p className="text-sm text-muted-foreground">
              Billing status: {home.subscription.status}
              {home.subscription.billingPlanCode ? ` · ${home.subscription.billingPlanCode}` : ""}
            </p>
          ) : null}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-medium">Upcoming appointments</h2>
            <Link
              to="/advisors-portal/appointments"
              className="text-sm text-primary underline-offset-4 hover:underline"
            >
              View all
            </Link>
          </div>
          {home.upcomingAppointments.length === 0 ? (
            <EmptyState
              title="No upcoming appointments"
              description="Book or manage consultations from Appointments."
              action={
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm">
                    <Link to="/advisors/book">Book consultation</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/advisors-portal/appointments">View appointments</Link>
                  </Button>
                </div>
              }
            />
          ) : (
            <ul className="space-y-2">
              {home.upcomingAppointments.map((item) => (
                <li key={item.id} className="rounded-lg border border-border p-3 text-sm">
                  <p className="font-medium">{new Date(item.startsAt).toLocaleString()}</p>
                  <p className="text-muted-foreground">
                    {item.advisorName || "Advisor"}
                    {item.serviceCode ? ` · ${item.serviceCode}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-xs text-muted-foreground">{home.calendarOAuth.note}</p>
      </ListWorkspace>
    </main>
  );
}
