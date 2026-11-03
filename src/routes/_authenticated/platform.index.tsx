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
  if (query.isPending) return <p role="status">Loading platform permissions…</p>;
  if (query.isError)
    return (
      <div role="alert">
        <p>{query.error.message}</p>
        <button className="mt-3 underline" onClick={() => void query.refetch()}>
          Retry platform access
        </button>
      </div>
    );
  if (!query.data) return <p>No platform context returned.</p>;
  const allowed = visibleSections(query.data.permissions);
  const current = allowed.find(([id]) => id === section) ?? allowed[0];
  if (!current) return <p>No platform permissions assigned.</p>;
  const [id, title, description] = current;
  return (
    <>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">
          Platform operations
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{description}</p>
      </div>
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
    </>
  );
}
