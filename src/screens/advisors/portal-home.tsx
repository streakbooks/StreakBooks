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

const PORTAL_ACTIONS = [
  {
    key: "tasks",
    label: "Tasks from your advisor",
    description: "See next steps and due dates for your service.",
    href: "/advisors-portal/tasks" as const,
    count: (home: { openTasks: number }) => home.openTasks,
    action: "Review tasks",
  },
  {
    key: "documents",
    label: "Files to send",
    description: "Review requested information and confirm when you have shared it.",
    href: "/advisors-portal/documents" as const,
    count: (home: { openDocuments: number }) => home.openDocuments,
    action: "Review requests",
  },
  {
    key: "updates",
    label: "Unread updates",
    description: "Read notices about your advisor service.",
    href: "/advisors-portal/account" as const,
    count: (home: { unreadNotifications: number }) => home.unreadNotifications,
    action: "View updates",
  },
] as const;

export function AdvisorsPortalHomePage() {
  const homeFn = useServerFn(getAdvisorsPortalHome);
  const query = useQuery({
    queryKey: ["advisors-portal-home"],
    queryFn: () => homeFn(),
    retry: false,
  });

  if (query.isPending)
    return (
      <main className="mx-auto max-w-5xl space-y-6 p-6">
        <ListWorkspace
          title="Your advisor service"
          description="Your Link Business Advisory plan, next steps and appointments."
        >
          <AdvisorsPortalSubnav />
          <div role="status" aria-live="polite">
            <LoadingState />
          </div>
        </ListWorkspace>
      </main>
    );
  if (query.isError) {
    return (
      <main className="mx-auto max-w-5xl space-y-6 p-6">
        <ListWorkspace
          title="Your advisor service"
          description="Your Link Business Advisory plan, next steps and appointments."
        >
          <AdvisorsPortalSubnav />
          <QueryErrorState queries={[query]} title="Portal unavailable" />
        </ListWorkspace>
      </main>
    );
  }
  if (!query.isSuccess || !query.data) return null;

  const home = query.data;
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <ListWorkspace
        title="Your advisor service"
        description={`Hello ${home.client.name || home.client.email}. Track your Link Business Advisory plan, next steps and appointments here.`}
        subnav={<AdvisorsPortalSubnav />}
      >
        <section aria-labelledby="portal-next-steps" className="space-y-3">
          <div>
            <h2 id="portal-next-steps" className="text-lg font-semibold">
              What needs your attention
            </h2>
            <p className="text-sm text-muted-foreground">
              Start here to keep your advisor work moving.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {PORTAL_ACTIONS.map((item) => {
              const count = item.count(home);
              return (
                <Link
                  key={item.key}
                  to={item.href}
                  className="group rounded-xl border border-border/70 bg-card p-4 transition hover:border-primary/40 hover:bg-muted/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-medium">{item.label}</h3>
                    <span className="text-2xl font-semibold tabular-nums">{count}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                  <p className="mt-3 text-sm font-medium text-primary">
                    {count > 0 ? item.action : "You’re all caught up"}
                  </p>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="space-y-3 rounded-xl border border-border/70 bg-card p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">Your service plan</h2>
            {home.engagement ? (
              <Badge variant="secondary">{home.engagement.status.replaceAll("_", " ")}</Badge>
            ) : null}
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
              {home.engagement?.scopeSummary ? (
                <p className="text-sm text-muted-foreground">{home.engagement.scopeSummary}</p>
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
              Payment status: {home.subscription.status.replaceAll("_", " ")}
              {home.subscription.billingPlanCode ? ` · ${home.subscription.billingPlanCode}` : ""}
            </p>
          ) : null}
          <Button asChild size="sm" variant="outline">
            <Link to="/advisors-portal/account">Ask about your plan or billing</Link>
          </Button>
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
