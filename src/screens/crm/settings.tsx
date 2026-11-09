import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { CrmSubnav } from "@/components/crm/CrmSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { getCrmSettings, upsertCrmSettings } from "@/lib/crm/crm.functions";
import type { Permission } from "@/lib/permissions";
import { toast } from "sonner";

export function CrmSettingsPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canAdmin = can("crm.admin" as Permission);
  const queryClient = useQueryClient();
  const fetchSettings = useServerFn(getCrmSettings);
  const saveSettings = useServerFn(upsertCrmSettings);

  const settings = useQuery({
    queryKey: ["crm-settings", company?.id],
    queryFn: () => fetchSettings({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canAdmin,
    retry: false,
  });

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [leadPrefix, setLeadPrefix] = useState<string | null>(null);
  const [oppPrefix, setOppPrefix] = useState<string | null>(null);
  const [staleDays, setStaleDays] = useState<number | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!company || !settings.data) throw new Error("Settings not loaded");
      return saveSettings({
        data: {
          companyId: company.id,
          enabled: enabled ?? settings.data.enabled,
          leadNumberPrefix: leadPrefix ?? settings.data.leadNumberPrefix,
          opportunityNumberPrefix: oppPrefix ?? settings.data.opportunityNumberPrefix,
          staleDealDays: staleDays ?? settings.data.staleDealDays,
          expectedVersion: settings.data.version,
        },
      });
    },
    onSuccess: async () => {
      toast.success("CRM settings saved");
      setEnabled(null);
      setLeadPrefix(null);
      setOppPrefix(null);
      setStaleDays(null);
      await queryClient.invalidateQueries({ queryKey: ["crm-settings", company?.id] });
      await queryClient.invalidateQueries({ queryKey: ["crm-dashboard-kpis", company?.id] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canAdmin) {
    return (
      <ListWorkspace title="CRM Settings" description="Organisation CRM configuration.">
        <CrmSubnav current="settings" />
        <EmptyState
          title="Administrator access required"
          description="Only users with crm.admin can change CRM settings."
        />
      </ListWorkspace>
    );
  }

  const current = settings.data;
  const enabledValue = enabled ?? current?.enabled ?? false;
  const leadPrefixValue = leadPrefix ?? current?.leadNumberPrefix ?? "LEAD-";
  const oppPrefixValue = oppPrefix ?? current?.opportunityNumberPrefix ?? "OPP-";
  const staleValue = staleDays ?? current?.staleDealDays ?? 30;

  return (
    <ListWorkspace
      title="CRM Settings"
      description="Enable CRM and configure numbering and stale-deal alerts."
      breadcrumbs={[{ label: "CRM", to: "/crm" }, { label: "Settings" }]}
      actions={
        <Button
          type="button"
          disabled={!current || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Saving…" : "Save settings"}
        </Button>
      }
    >
      <CrmSubnav current="settings" />
      {settings.isLoading ? <LoadingState /> : null}
      {settings.isError ? (
        <ErrorState title="Could not load settings" description={friendlyAuthError(settings.error)} onRetry={() => settings.refetch()} />
      ) : null}
      {current ? (
        <Card>
          <CardHeader>
            <CardTitle>Module</CardTitle>
            <CardDescription>
              Enabling CRM seeds a default Sales pipeline and lead sources. It does not change
              Contacts or post accounting journals.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="crm-enabled">Enable CRM</Label>
                <p className="text-sm text-muted-foreground">
                  Required before creating leads or opportunities.
                </p>
              </div>
              <Switch
                id="crm-enabled"
                checked={enabledValue}
                onCheckedChange={setEnabled}
                aria-label="Enable CRM"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="lead-prefix">Lead number prefix</Label>
                <Input
                  id="lead-prefix"
                  value={leadPrefixValue}
                  onChange={(e) => setLeadPrefix(e.target.value)}
                  maxLength={12}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="opp-prefix">Opportunity number prefix</Label>
                <Input
                  id="opp-prefix"
                  value={oppPrefixValue}
                  onChange={(e) => setOppPrefix(e.target.value)}
                  maxLength={12}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stale-days">Stale deal days</Label>
                <Input
                  id="stale-days"
                  type="number"
                  min={1}
                  max={3650}
                  value={staleValue}
                  onChange={(e) => setStaleDays(Number(e.target.value) || 30)}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </ListWorkspace>
  );
}
