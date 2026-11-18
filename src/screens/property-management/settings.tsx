import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { PmSubnav } from "@/components/property-management/PmSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { getPmSettings, upsertPmSettings } from "@/lib/property-management/pm.functions";
import type { PmBusinessModel, PmRentalMode } from "@/lib/property-management/types";
import type { Permission } from "@/lib/permissions";
import { toast } from "sonner";

export function PmSettingsPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canAdmin = can("property.settings.manage" as Permission);
  const queryClient = useQueryClient();
  const fetchSettings = useServerFn(getPmSettings);
  const saveSettings = useServerFn(upsertPmSettings);

  const settings = useQuery({
    queryKey: ["pm-settings", company?.id],
    queryFn: () => fetchSettings({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canAdmin,
    retry: false,
  });

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [prefix, setPrefix] = useState<string | null>(null);
  const [rentalMode, setRentalMode] = useState<PmRentalMode | null>(null);
  const [businessModel, setBusinessModel] = useState<PmBusinessModel | null>(null);
  const [requireHundred, setRequireHundred] = useState<boolean | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!company || !settings.data) throw new Error("Settings not loaded");
      return saveSettings({
        data: {
          companyId: company.id,
          enabled: enabled ?? settings.data.enabled,
          defaultRentalMode: rentalMode ?? settings.data.defaultRentalMode,
          defaultBusinessModel: businessModel ?? settings.data.defaultBusinessModel,
          propertyNumberPrefix: prefix ?? settings.data.propertyNumberPrefix,
          requireOwnershipHundredPct: requireHundred ?? settings.data.requireOwnershipHundredPct,
          expectedVersion: settings.data.version,
        },
      });
    },
    onSuccess: async () => {
      toast.success("Property Management settings saved");
      setEnabled(null);
      setPrefix(null);
      setRentalMode(null);
      setBusinessModel(null);
      setRequireHundred(null);
      await queryClient.invalidateQueries({ queryKey: ["pm-settings", company?.id] });
      await queryClient.invalidateQueries({ queryKey: ["pm-dashboard-kpis", company?.id] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canAdmin) {
    return (
      <ListWorkspace title="Settings" description="Organisation Property Management configuration.">
        <PmSubnav current="settings" />
        <EmptyState
          title="Administrator access required"
          description="Only users with property.settings.manage can change these settings."
        />
      </ListWorkspace>
    );
  }

  const current = settings.data;
  const enabledValue = enabled ?? current?.enabled ?? false;
  const prefixValue = prefix ?? current?.propertyNumberPrefix ?? "PROP-";
  const rentalValue = rentalMode ?? current?.defaultRentalMode ?? "hybrid";
  const modelValue = businessModel ?? current?.defaultBusinessModel ?? "agency";
  const hundredValue = requireHundred ?? current?.requireOwnershipHundredPct ?? true;

  return (
    <ListWorkspace
      title="Settings"
      description="Enable the module and set portfolio defaults. Accounting mappings land in later batches."
      breadcrumbs={[
        { label: "Property Management", to: "/property-management" },
        { label: "Settings" },
      ]}
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
      <PmSubnav current="settings" />
      {settings.isLoading ? <LoadingState /> : null}
      {settings.isError ? (
        <ErrorState
          title="Could not load settings"
          description={friendlyAuthError(settings.error)}
        onRetry={() => settings.refetch()}
        />
      ) : null}
      {current ? (
        <Card>
          <CardHeader>
            <CardTitle>Module configuration</CardTitle>
            <CardDescription>
              Business model defaults guide posting rules later. They do not create journals yet.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="pm-enabled">Enable Property Management</Label>
                <p className="text-sm text-muted-foreground">
                  Required before creating properties, units and owners.
                </p>
              </div>
              <Switch
                id="pm-enabled"
                checked={enabledValue}
                onCheckedChange={(value) => setEnabled(value)}
              />
            </div>
            <div className="grid gap-2 sm:max-w-sm">
              <Label htmlFor="pm-prefix">Property number prefix</Label>
              <Input
                id="pm-prefix"
                value={prefixValue}
                onChange={(event) => setPrefix(event.target.value)}
                maxLength={12}
              />
            </div>
            <div className="grid gap-2 sm:max-w-sm">
              <Label>Default rental mode</Label>
              <Select
                value={rentalValue}
                onValueChange={(value) => setRentalMode(value as PmRentalMode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="short_term">Short-term rentals</SelectItem>
                  <SelectItem value="long_term">Long-term rentals</SelectItem>
                  <SelectItem value="hybrid">Hybrid portfolio</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2 sm:max-w-sm">
              <Label>Default business model</Label>
              <Select
                value={modelValue}
                onValueChange={(value) => setBusinessModel(value as PmBusinessModel)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="agency">Agency (client money)</SelectItem>
                  <SelectItem value="principal">Principal / operator</SelectItem>
                  <SelectItem value="owner_direct">Owner-direct collection</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="pm-hundred">Require 100% ownership coverage</Label>
                <p className="text-sm text-muted-foreground">
                  When ownership rows exist for a date, ownership percentages must total 100%.
                </p>
              </div>
              <Switch
                id="pm-hundred"
                checked={hundredValue}
                onCheckedChange={(value) => setRequireHundred(value)}
              />
            </div>
          </CardContent>
        </Card>
      ) : null}
    </ListWorkspace>
  );
}
