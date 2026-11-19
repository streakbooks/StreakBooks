import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Link } from "@tanstack/react-router";
import { Route } from "@/routes/_authenticated/advisors-portal.tasks";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AdvisorsPortalSubnav } from "@/components/advisors/AdvisorsPortalSubnav";
import { Link } from "@tanstack/react-router";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listAdvisorsPortalTasks } from "@/lib/advisors/portal.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";

export function AdvisorsPortalTasksPage() {
  const { status } = Route.useSearch();
  const list = useServerFn(listAdvisorsPortalTasks);
  const query = useQuery({
    queryKey: ["advisors-portal-tasks"],
    queryFn: () => list(),
    retry: false,
  });

  if (query.isPending) return <LoadingState />;
  if (query.isError) {
    return (
      <main className="mx-auto max-w-5xl space-y-6 p-6">
        <ListWorkspace title="Tasks" description="Delivery tasks on your Advisors workspace.">
          <ErrorState
            title="Tasks unavailable"
            description={friendlyAuthError(query.error)}
            onRetry={() => void query.refetch()}
          />
        </ListWorkspace>
      </main>
    );
  }

  const statuses = Array.from(new Set(query.data.map((item) => item.status))).sort();
  const visibleTasks = status ? query.data.filter((item) => item.status === status) : query.data;

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <ListWorkspace title="Tasks" description="Assigned delivery work for your active engagement.">
        <AdvisorsPortalSubnav />
        {query.data.length > 0 ? (
          <nav aria-label="Filter tasks by status" className="flex flex-wrap gap-2">
            {[undefined, ...statuses].map((value) => (
              <Link
                key={value ?? "all"}
                to="/advisors-portal/tasks"
                search={{ status: value }}
                aria-current={status === value ? "page" : undefined}
                className={`rounded-md border px-3 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${status === value ? "border-primary bg-primary/10 font-semibold" : "border-border hover:bg-muted"}`}
              >
                {value ?? "All tasks"}
              </Link>
            ))}
          </nav>
        ) : null}
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          {visibleTasks.length} of {query.data.length} tasks shown
        </p>
        {query.data.length === 0 ? (
          <EmptyState
            title="No tasks"
            description="Tasks appear once your advisor opens a delivery period."
            action={
              <Button asChild size="sm" variant="outline">
                <Link to="/advisors-portal">Portal home</Link>
              </Button>
            }
          />
        ) : visibleTasks.length === 0 ? (
          <div className="space-y-3">
            <EmptyState
              title="No matching tasks"
              description="No tasks match this status. Choose All tasks to see the complete list."
            />
            <Link
              to="/advisors-portal/tasks"
              search={{ status: undefined }}
              className="inline-flex rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Clear status filter
            </Link>
          </div>
        ) : (
          <ul className="space-y-3" aria-label={`${visibleTasks.length} matching tasks`}>
            {visibleTasks.map((item) => (
              <li key={item.id} className="rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{item.title}</p>
                  <Badge variant="secondary">{item.status}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {item.workspaceTitle} · {item.kind}
                  {item.requiresDocument ? " · needs document" : ""}
                </p>
                {item.description ? (
                  <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </ListWorkspace>
    </main>
  );
}
