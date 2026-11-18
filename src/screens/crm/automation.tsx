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
import { getCrmAutomationPolicy, getCrmSettings } from "@/lib/crm/crm.functions";
import type { Permission } from "@/lib/permissions";

export function CrmAutomationPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canManage = can("crm.automation.manage" as Permission) || can("crm.admin" as Permission);
  const fetchSettings = useServerFn(getCrmSettings);
  const fetchPolicy = useServerFn(getCrmAutomationPolicy);

  const settings = useQuery({
    queryKey: ["crm-settings", company?.id],
    queryFn: () => fetchSettings({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canManage,
    retry: false,
  });

  const policy = useQuery({
    queryKey: ["crm-automation-policy", company?.id],
    queryFn: () => fetchPolicy({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canManage && settings.data?.enabled === true,
    retry: false,
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canManage) {
    return (
      <ListWorkspace title="Automation" description="CRM workflow rules and triggers.">
        <EmptyState
          title="No automation access"
          description="Ask an administrator for crm.automation.manage."
        />
      </ListWorkspace>
    );
  }

  return (
    <ListWorkspace
      title="Automation"
      description="Workflow triggers stay flagged off until durable runners and audit logs exist."
      breadcrumbs={[{ label: "CRM", to: "/crm" }, { label: "Automation" }]}
      subnav={<CrmSubnav current="automation" />}
    >
      {settings.data && !settings.data.enabled ? (
        <EmptyState title="CRM is disabled" description="Enable CRM before reviewing automation." />
      ) : null}

      {settings.data?.enabled ? (
        <div className="space-y-4">
          {policy.isLoading ? <LoadingState /> : null}
          {policy.isError ? (
            <ErrorState
              title="Could not load automation policy"
              description={friendlyAuthError(policy.error)}
              onRetry={() => policy.refetch()}
            />
          ) : null}
          {policy.data ? (
            <>
              <Alert>
                <AlertTitle>Engine {policy.data.engineEnabled ? "enabled" : "disabled"}</AlertTitle>
                <AlertDescription>{policy.data.reason}</AlertDescription>
              </Alert>
              <EmptyState
                title="No automation rules"
                description="Rule create and run actions are blocked so CRM cannot fire silent side effects."
                action={
                  <Button type="button" disabled title="Blocked until automation runners ship">
                    New automation rule
                  </Button>
                }
              />
            </>
          ) : null}
        </div>
      ) : null}
    </ListWorkspace>
  );
}
