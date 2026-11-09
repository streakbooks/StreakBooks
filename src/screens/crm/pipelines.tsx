import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CrmSubnav } from "@/components/crm/CrmSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { getCrmSettings, listCrmPipelines } from "@/lib/crm/crm.functions";
import type { Permission } from "@/lib/permissions";

export function CrmPipelinesPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canView = can("crm.view" as Permission) || can("crm.admin" as Permission);
  const fetchSettings = useServerFn(getCrmSettings);
  const fetchPipelines = useServerFn(listCrmPipelines);

  const settings = useQuery({
    queryKey: ["crm-settings", company?.id],
    queryFn: () => fetchSettings({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });

  const pipelines = useQuery({
    queryKey: ["crm-pipelines", company?.id],
    queryFn: () => fetchPipelines({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView && settings.data?.enabled === true,
    retry: false,
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canView) {
    return (
      <ListWorkspace title="Pipelines" description="Sales pipelines and stages.">
        <EmptyState title="No CRM access" description="Ask an administrator for crm.view." />
      </ListWorkspace>
    );
  }

  return (
    <ListWorkspace
      title="Sales Pipelines"
      description="Configurable stages with win probability. Stage edits for custom pipelines arrive in CRM-05/12."
      breadcrumbs={[{ label: "CRM", to: "/crm" }, { label: "Pipelines" }]}
    >
      <CrmSubnav current="pipelines" />
      {settings.data && !settings.data.enabled ? (
        <EmptyState title="CRM is disabled" description="Enable CRM to seed the default Sales pipeline." />
      ) : null}
      {pipelines.isLoading ? <LoadingState /> : null}
      {pipelines.isError ? (
        <ErrorState
          title="Could not load pipelines"
          description={friendlyAuthError(pipelines.error)}
         onRetry={() => pipelines.refetch()}/>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {(pipelines.data?.pipelines ?? []).map((pipeline) => {
          const stages = (pipelines.data?.stages ?? [])
            .filter((s) => s.pipelineId === pipeline.id)
            .sort((a, b) => a.sortOrder - b.sortOrder);
          return (
            <Card key={pipeline.id}>
              <CardHeader>
                <CardTitle>
                  {pipeline.name}
                  {pipeline.isDefault ? " (default)" : ""}
                </CardTitle>
                <CardDescription>{pipeline.description ?? "Pipeline stages"}</CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="space-y-2">
                  {stages.map((stage) => (
                    <li
                      key={stage.id}
                      className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                    >
                      <span>
                        {stage.name}
                        {stage.isWon ? " · Won" : ""}
                        {stage.isLost ? " · Lost" : ""}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {stage.probabilityPct}%
                      </span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </ListWorkspace>
  );
}
