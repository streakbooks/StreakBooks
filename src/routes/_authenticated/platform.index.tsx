import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPlatformContext } from "@/lib/platform/platform.functions";
import { sections, sectionSchema, visibleSections } from "@/lib/platform/catalog";
import { PlatformOverview } from "@/components/platform/PlatformOverview";
import { PlatformResource } from "@/components/platform/PlatformResource";
import { PlatformHealth } from "@/components/platform/PlatformHealth";
export const Route = createFileRoute("/_authenticated/platform/")({
  validateSearch: (input: Record<string, unknown>) => ({
    section: sectionSchema.catch("overview").parse(input["section"]),
  }),
  component: PlatformHome,
});
function PlatformHome() {
  const { section } = Route.useSearch();
  const navigate = useNavigate();
  const load = useServerFn(getPlatformContext);
  const query = useQuery({
    queryKey: ["platform", "context"],
    queryFn: () => load(),
    staleTime: 30000,
    retry: false,
  });
  if (!query.data) return null;
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
      {id === "overview" ? (
        <PlatformOverview
          allowedSections={allowed.map(([id]) => id)}
          onSection={(s) => {
            if (allowed.some(([id]) => id === s))
              void navigate({ to: "/platform", search: { section: s } });
          }}
        />
      ) : id === "monitoring" ? (
        <PlatformHealth />
      ) : (
        <PlatformResource key={id} section={id} context={query.data} />
      )}
    </>
  );
}
