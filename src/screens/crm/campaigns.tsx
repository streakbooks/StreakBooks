import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CrmSubnav } from "@/components/crm/CrmSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { getCrmSettings, listCrmLeadSources } from "@/lib/crm/crm.functions";
import type { Permission } from "@/lib/permissions";

export function CrmCampaignsPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canView =
    can("crm.view" as Permission) ||
    can("crm.campaigns.manage" as Permission) ||
    can("crm.admin" as Permission);
  const fetchSettings = useServerFn(getCrmSettings);
  const fetchSources = useServerFn(listCrmLeadSources);

  const settings = useQuery({
    queryKey: ["crm-settings", company?.id],
    queryFn: () => fetchSettings({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });

  const sources = useQuery({
    queryKey: ["crm-lead-sources", company?.id],
    queryFn: () => fetchSources({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView && settings.data?.enabled === true,
    retry: false,
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canView) {
    return (
      <ListWorkspace title="Campaigns & Sources" description="Attribution sources for leads.">
        <EmptyState title="No CRM access" description="Ask an administrator for crm.view." />
      </ListWorkspace>
    );
  }

  const rows = sources.data ?? [];

  return (
    <ListWorkspace
      title="Campaigns & Sources"
      description="Lead source catalogue is live. Multi-touch campaign records stay fail-closed until CRM-11 campaign persistence ships."
      breadcrumbs={[{ label: "CRM", to: "/crm" }, { label: "Campaigns & Sources" }]}
    >
      <CrmSubnav current="campaigns" />

      {settings.data && !settings.data.enabled ? (
        <EmptyState title="CRM is disabled" description="Enable CRM to load lead sources." />
      ) : null}

      {settings.data?.enabled ? (
        <div className="space-y-4">
          <Alert>
            <AlertTitle>Campaign records</AlertTitle>
            <AlertDescription>
              Creating marketing campaigns, spend, and multi-touch attribution is not available yet. Lead sources below already feed lead capture.
            </AlertDescription>
          </Alert>

          <div className="flex justify-end">
            <Button type="button" disabled title="Blocked until campaign backend exists">
              New campaign
            </Button>
          </div>

          {sources.isLoading ? <LoadingState /> : null}
          {sources.isError ? (
            <ErrorState
              title="Could not load lead sources"
              description={friendlyAuthError(sources.error)}
              onRetry={() => sources.refetch()}
            />
          ) : null}
          {sources.isSuccess && rows.length === 0 ? (
            <EmptyState title="No lead sources" description="Sources seed when CRM is enabled." />
          ) : null}
          {rows.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((source) => (
                    <TableRow key={source.id}>
                      <TableCell className="font-mono text-sm">{source.code}</TableCell>
                      <TableCell>{source.name}</TableCell>
                      <TableCell>{source.isActive ? "Active" : "Inactive"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </div>
      ) : null}
    </ListWorkspace>
  );
}
