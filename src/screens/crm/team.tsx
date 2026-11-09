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
import {
  getCrmSettings,
  getCrmTerritoryPolicy,
  listCrmTeamWorkload,
} from "@/lib/crm/crm.functions";
import type { Permission } from "@/lib/permissions";

export function CrmTeamPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canAdmin = can("crm.admin" as Permission);
  const fetchSettings = useServerFn(getCrmSettings);
  const fetchTeam = useServerFn(listCrmTeamWorkload);
  const fetchTerritory = useServerFn(getCrmTerritoryPolicy);

  const settings = useQuery({
    queryKey: ["crm-settings", company?.id],
    queryFn: () => fetchSettings({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canAdmin,
    retry: false,
  });

  const team = useQuery({
    queryKey: ["crm-team-workload", company?.id],
    queryFn: () => fetchTeam({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canAdmin && settings.data?.enabled === true,
    retry: false,
  });

  const territory = useQuery({
    queryKey: ["crm-territory-policy", company?.id],
    queryFn: () => fetchTerritory({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canAdmin && settings.data?.enabled === true,
    retry: false,
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canAdmin) {
    return (
      <ListWorkspace title="Team & Territories" description="CRM ownership and assignment rules.">
        <EmptyState title="No CRM admin access" description="Ask an administrator for crm.admin." />
      </ListWorkspace>
    );
  }

  const rows = team.data?.members ?? [];
  const territoryPolicy = territory.data ?? team.data?.territory;

  return (
    <ListWorkspace
      title="Team & Territories"
      description="Company members with CRM lead and opportunity ownership. Territory rules stay fail-closed."
      breadcrumbs={[{ label: "CRM", to: "/crm" }, { label: "Team & Territories" }]}
    >
      <CrmSubnav current="team" />

      {settings.data && !settings.data.enabled ? (
        <EmptyState title="CRM is disabled" description="Enable CRM before reviewing team workload." />
      ) : null}

      {settings.data?.enabled ? (
        <div className="space-y-4">
          <Alert>
            <AlertTitle>Territories</AlertTitle>
            <AlertDescription>
              {territoryPolicy?.reason ??
                "Territory assignment rules are not available yet."}
            </AlertDescription>
          </Alert>

          <div className="flex justify-end">
            <Button
              type="button"
              disabled={!territoryPolicy?.canManageTerritories}
              title={
                territoryPolicy?.canManageTerritories
                  ? undefined
                  : "Blocked until territory backends exist"
              }
            >
              New territory
            </Button>
          </div>

          {team.isLoading ? <LoadingState /> : null}
          {team.isError ? (
            <ErrorState
              title="Could not load team workload"
              description={friendlyAuthError(team.error)}
              onRetry={() => team.refetch()}
            />
          ) : null}
          {team.isSuccess && rows.length === 0 ? (
            <EmptyState title="No members" description="Invite organisation members first." />
          ) : null}
          {rows.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Open leads</TableHead>
                    <TableHead className="text-right">Open opportunities</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.userId}>
                      <TableCell>
                        <div className="font-medium">
                          {row.fullName || row.email || row.userId.slice(0, 8)}
                          {row.isYou ? " (you)" : ""}
                        </div>
                        {row.fullName && row.email ? (
                          <div className="text-sm text-muted-foreground">{row.email}</div>
                        ) : null}
                      </TableCell>
                      <TableCell className="capitalize">{row.role}</TableCell>
                      <TableCell className="capitalize">{row.status}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.openLeadCount}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.openOpportunityCount}
                      </TableCell>
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
