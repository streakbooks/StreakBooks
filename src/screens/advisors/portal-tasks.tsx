import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AdvisorsPortalSubnav } from "@/components/advisors/AdvisorsPortalSubnav";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/common/states";
import { StatusBadge } from "@/components/common/StatusBadge";
import { listAdvisorsPortalTasks } from "@/lib/advisors/portal.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";

export function AdvisorsPortalTasksPage() {
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
        <PageHeader title="Tasks" description="Delivery tasks on your Advisors workspace." />
        <ErrorState
          title="Tasks unavailable"
          description={friendlyAuthError(query.error)}
          onRetry={() => void query.refetch()}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <PageHeader title="Tasks" description="Assigned delivery work for your active engagement." />
      <AdvisorsPortalSubnav />
      {query.data.length === 0 ? (
        <EmptyState
          title="No tasks"
          description="Tasks appear once your advisor opens a delivery period."
        />
      ) : (
        <ul className="space-y-3">
          {query.data.map((item) => (
            <li key={item.id} className="rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{item.title}</p>
                <StatusBadge status={item.status} />
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
    </main>
  );
}
