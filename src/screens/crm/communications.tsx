import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CrmSubnav } from "@/components/crm/CrmSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { EmptyState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";

import { getCrmCommsPolicy, getCrmSettings } from "@/lib/crm/crm.functions";
import type { Permission } from "@/lib/permissions";

export function CrmCommunicationsPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canView = can("crm.view" as Permission) || can("crm.admin" as Permission);
  const fetchSettings = useServerFn(getCrmSettings);
  const fetchPolicy = useServerFn(getCrmCommsPolicy);

  const settings = useQuery({
    queryKey: ["crm-settings", company?.id],
    queryFn: () => fetchSettings({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });

  const policy = useQuery({
    queryKey: ["crm-comms-policy", company?.id],
    queryFn: () => fetchPolicy({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView && settings.data?.enabled === true,
    retry: false,
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canView) {
    return (
      <ListWorkspace title="Communications" description="CRM email and message delivery.">
        <EmptyState title="No CRM access" description="Ask an administrator for crm.view." />
      </ListWorkspace>
    );
  }

  return (
    <ListWorkspace
      title="Communications"
      description="Outbound CRM email is intentionally fail-closed until a provider is approved and connected."
      breadcrumbs={[{ label: "CRM", to: "/crm" }, { label: "Communications" }]}
      subnav={<CrmSubnav current="communications" />}
    >
      {settings.data && !settings.data.enabled ? (
        <EmptyState
          title="CRM is disabled"
          description="Enable CRM before configuring communications."
        />
      ) : null}

      {settings.isError ? (
        <QueryErrorState queries={[settings]} title="Could not load CRM settings" />
      ) : settings.isLoading ? (
        <LoadingState />
      ) : null}

      {settings.data?.enabled ? (
        <div className="space-y-4">
          {policy.isLoading ? <LoadingState /> : null}
          {policy.isError ? (
            <QueryErrorState queries={[policy]} title="Could not load communications policy" />
          ) : null}
          {policy.data ? (
            <>
              <Alert>
                <AlertTitle>Provider status: {policy.data.providerStatus}</AlertTitle>
                <AlertDescription>{policy.data.reason}</AlertDescription>
              </Alert>
              <EmptyState
                title="Send is disabled"
                description="Compose and send stay blocked so CRM cannot silently email contacts. Connect an App Store–approved provider in a later batch."
                action={
                  <Button
                    type="button"
                    disabled
                    title="Blocked until an email provider is configured"
                  >
                    Compose email
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
