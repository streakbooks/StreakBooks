import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPlatformContext } from "@/lib/platform/platform.functions";
import { visibleSections } from "@/lib/platform/catalog";
import { PlatformOverview } from "@/components/platform/PlatformOverview";
import { PlatformResource } from "@/components/platform/PlatformResource";
import { PlatformHealth } from "@/components/platform/PlatformHealth";
import { PlatformApprovals } from "@/components/platform/PlatformApprovals";
import { parsePlatformSearch } from "@/lib/platform/navigation";
import { LoadingState, EmptyState } from "@/components/common/states";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
export const Route = createFileRoute("/_authenticated/platform/")({
  validateSearch: parsePlatformSearch,
  component: PlatformHome,
});
function PlatformHome() {
  const { section, record } = Route.useSearch();
  const navigate = useNavigate({ from: "/platform/" });
  const load = useServerFn(getPlatformContext);
  const query = useQuery({
    queryKey: ["platform", "context"],
    queryFn: () => load(),
    staleTime: 30000,
    retry: false,
  });
  if (query.isPending) return <LoadingState rows={4} />;
  if (query.isError)
    return <QueryErrorState queries={[query]} title="Could not load platform access" />;
  const allowed = visibleSections(query.data.permissions);
  const current = allowed.find(([id]) => id === section) ?? allowed[0];
  if (!current)
    return (
      <EmptyState
        title="No platform access assigned"
        description="Your account does not have access to platform administration. Contact your administrator if you need access."
      />
    );
  const [id, title, description] = current;
  return (
    <ListWorkspace title={title} description={description}>
      {id === "approvals" ? (
        <PlatformApprovals
          canManage={query.data.permissions.includes("approvals.manage")}
          userId={query.data.userId}
          canGrant={query.data.permissions.includes("features.manage")}
        />
      ) : id === "overview" ? (
        <PlatformOverview allowedSections={allowed.map(([id]) => id)} />
      ) : id === "monitoring" ? (
        <PlatformHealth />
      ) : (
        <PlatformResource
          key={id}
          section={id}
          context={query.data}
          recordId={id === section ? record : undefined}
          closeRecord={() =>
            void navigate({ to: "/platform", search: { section: id }, replace: true })
          }
        />
      )}
    </ListWorkspace>
  );
}
