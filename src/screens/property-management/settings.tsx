import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
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
import { listAccounts } from "@/lib/accounting/accounting.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { getPmSettings, upsertPmSettings } from "@/lib/property-management/pm.functions";
import { upsertPmAccountMappings } from "@/lib/property-management/pm-posting.functions";
import type { PmBusinessModel, PmRentalMode } from "@/lib/property-management/types";
import type { Permission } from "@/lib/permissions";
import { toast } from "sonner";

const NONE = "__none__";

type MappingKey =
  | "rentIncomeAccountId"
  | "rentReceivableAccountId"
  | "ownerPayableAccountId"
  | "commissionIncomeAccountId"
  | "trustBankAccountId"
  | "depositLiabilityAccountId"
  | "operatingBankAccountId";

export function PmSettingsPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canAdmin = can("property.settings.manage" as Permission);
  const queryClient = useQueryClient();
  const fetchSettings = useServerFn(getPmSettings);
  const saveSettings = useServerFn(upsertPmSettings);
  const saveMappings = useServerFn(upsertPmAccountMappings);
  const fetchAccounts = useServerFn(listAccounts);

  const settings = useQuery({
    queryKey: ["pm-settings", company?.id],
    queryFn: () => fetchSettings({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canAdmin,
    retry: false,
  });
  const accounts = useQuery({
    queryKey: ["accounts", company?.id, "pm-settings"],
    queryFn: () => fetchAccounts({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canAdmin,
    retry: false,
  });

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [prefix, setPrefix] = useState<string | null>(null);
  const [rentalMode, setRentalMode] = useState<PmRentalMode | null>(null);
  const [businessModel, setBusinessModel] = useState<PmBusinessModel | null>(null);
  const [requireHundred, setRequireHundred] = useState<boolean | null>(null);
  const [mappingsDraft, setMappingsDraft] = useState<Partial<Record<MappingKey, string | null>>>({});

  const postableAccounts = useMemo(
    () => (accounts.data ?? []).filter((account) => account.is_active && account.is_postable),
    [accounts.data],
  );

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

  const mappingMutation = useMutation({
    mutationFn: async () => {
      if (!company || !settings.data) throw new Error("Settings not loaded");
      const current = settings.data;
      return saveMappings({
        data: {
          companyId: company.id,
          expectedVersion: current.version,
          mappings: {
            rentIncomeAccountId:
              mappingsDraft.rentIncomeAccountId !== undefined
                ? mappingsDraft.rentIncomeAccountId
                : current.rentIncomeAccountId,
            rentReceivableAccountId:
              mappingsDraft.rentReceivableAccountId !== undefined
                ? mappingsDraft.rentReceivableAccountId
                : current.rentReceivableAccountId,
            ownerPayableAccountId:
              mappingsDraft.ownerPayableAccountId !== undefined
                ? mappingsDraft.ownerPayableAccountId
                : current.ownerPayableAccountId,
            commissionIncomeAccountId:
              mappingsDraft.commissionIncomeAccountId !== undefined
                ? mappingsDraft.commissionIncomeAccountId
                : current.commissionIncomeAccountId,
            trustBankAccountId:
              mappingsDraft.trustBankAccountId !== undefined
                ? mappingsDraft.trustBankAccountId
                : current.trustBankAccountId,
            depositLiabilityAccountId:
              mappingsDraft.depositLiabilityAccountId !== undefined
                ? mappingsDraft.depositLiabilityAccountId
                : current.depositLiabilityAccountId,
            operatingBankAccountId:
              mappingsDraft.operatingBankAccountId !== undefined
                ? mappingsDraft.operatingBankAccountId
                : current.operatingBankAccountId,
          },
        },
      });
    },
    onSuccess: async () => {
      toast.success("Account mappings saved");
      setMappingsDraft({});
      await queryClient.invalidateQueries({ queryKey: ["pm-settings", company?.id] });
      await queryClient.invalidateQueries({ queryKey: ["pm-trust-summary", company?.id] });
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

  const mappingValue = (key: MappingKey): string => {
    const draft = mappingsDraft[key];
    if (draft !== undefined) return draft ?? NONE;
    return current?.[key] ?? NONE;
  };

  const setMapping = (key: MappingKey, value: string) => {
    setMappingsDraft((prev) => ({ ...prev, [key]: value === NONE ? null : value }));
  };

  const accountSelect = (key: MappingKey, label: string, hint: string) => (
    <div className="grid gap-2" key={key}>
      <Label>{label}</Label>
      <p className="text-sm text-muted-foreground">{hint}</p>
      <Select value={mappingValue(key)} onValueChange={(value) => setMapping(key, value)}>
        <SelectTrigger>
          <SelectValue placeholder="Select account" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Not mapped</SelectItem>
          {postableAccounts.map((account) => (
            <SelectItem key={account.id} value={account.id}>
              {account.code} — {account.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <ListWorkspace
      title="Settings"
      description="Enable the module, set portfolio defaults, and map ledger accounts for posting."
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
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Module configuration</CardTitle>
              <CardDescription>
                Business model defaults guide agency vs principal posting behaviour.
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

          <Card>
            <CardHeader>
              <CardTitle>Ledger account mappings</CardTitle>
              <CardDescription>
                Required before posting rent, commission or owner payouts. Uses the company chart of
                accounts and existing post_journal.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 sm:grid-cols-2">
              {accountSelect(
                "rentIncomeAccountId",
                "Rent income",
                "Credited when a rent charge is posted.",
              )}
              {accountSelect(
                "rentReceivableAccountId",
                "Rent receivable",
                "Debited when a rent charge is posted.",
              )}
              {accountSelect(
                "ownerPayableAccountId",
                "Owner payable",
                "Used for commission and owner distributions.",
              )}
              {accountSelect(
                "commissionIncomeAccountId",
                "Commission income",
                "Credited when management commission is posted.",
              )}
              {accountSelect(
                "operatingBankAccountId",
                "Operating bank",
                "Required for posting readiness; fallback payout bank.",
              )}
              {accountSelect(
                "trustBankAccountId",
                "Trust / client bank",
                "Preferred bank for owner payouts when mapped.",
              )}
              {accountSelect(
                "depositLiabilityAccountId",
                "Deposit liability",
                "Optional mapping for security deposits.",
              )}
              <div className="flex items-end sm:col-span-2">
                <Button
                  type="button"
                  disabled={mappingMutation.isPending || accounts.isLoading}
                  onClick={() => mappingMutation.mutate()}
                >
                  {mappingMutation.isPending ? "Saving mappings…" : "Save account mappings"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </ListWorkspace>
  );
}
