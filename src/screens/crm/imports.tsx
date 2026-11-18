import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CrmSubnav } from "@/components/crm/CrmSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { getCrmImportExportPolicy, getCrmSettings } from "@/lib/crm/crm.functions";
import type { Permission } from "@/lib/permissions";

export function CrmImportsPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canOpen =
    can("crm.import" as Permission) ||
    can("crm.export" as Permission) ||
    can("crm.admin" as Permission);
  const fetchSettings = useServerFn(getCrmSettings);
  const fetchPolicy = useServerFn(getCrmImportExportPolicy);

  const settings = useQuery({
    queryKey: ["crm-settings", company?.id],
    queryFn: () => fetchSettings({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canOpen,
    retry: false,
  });

  const policy = useQuery({
    queryKey: ["crm-import-export-policy", company?.id],
    queryFn: () => fetchPolicy({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canOpen && settings.data?.enabled === true,
    retry: false,
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canOpen) {
    return (
      <ListWorkspace title="Imports & Exports" description="Bulk CRM data moves.">
        <EmptyState
          title="No import/export access"
          description="Ask an administrator for crm.import or crm.export."
        />
      </ListWorkspace>
    );
  }

  return (
    <ListWorkspace
      title="Imports & Exports"
      description="Permissions are registered; mapping and audit backends are not ready, so actions stay blocked."
      breadcrumbs={[{ label: "CRM", to: "/crm" }, { label: "Imports & Exports" }]}
      subnav={<CrmSubnav current="imports" />}
    >

      {settings.data && !settings.data.enabled ? (
        <EmptyState title="CRM is disabled" description="Enable CRM before import/export." />
      ) : null}

      {settings.data?.enabled ? (
        <div className="space-y-4">
          {policy.isLoading ? <LoadingState /> : null}
          {policy.isError ? (
            <ErrorState
              title="Could not load import/export policy"
              description={friendlyAuthError(policy.error)}
              onRetry={() => policy.refetch()}
            />
          ) : null}
          {policy.data ? (
            <>
              <Alert>
                <AlertTitle>Data move status</AlertTitle>
                <AlertDescription>{policy.data.reason}</AlertDescription>
              </Alert>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={!policy.data.canImport}
                  title={policy.data.canImport ? undefined : "Blocked until import backend exists"}
                >
                  Import leads
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!policy.data.canExport}
                  title={policy.data.canExport ? undefined : "Blocked until export backend exists"}
                >
                  Export opportunities
                </Button>
              </div>
              <EmptyState
                title="No jobs yet"
                description={
                  policy.data.hasImportPermission || policy.data.hasExportPermission
                    ? "Your permissions are present, but import/export runners are not shipped."
                    : "You need crm.import or crm.export once backends exist."
                }
              />
            </>
          ) : null}
        </div>
      ) : null}
    </ListWorkspace>
  );
}
