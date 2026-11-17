import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { HrSubnav } from "@/components/hr/HrSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { getHrSettings, seedHrDemoWorkforce, upsertHrSettings } from "@/lib/hr/hr.functions";

export function HrSettingsPage() {
  const { company, isPending } = useActiveCompany();
  const canEdit = useCanDo("hr.settings.edit");
  const canView = useCanDo("hr.view");
  const queryClient = useQueryClient();
  const fetchSettings = useServerFn(getHrSettings);
  const saveSettings = useServerFn(upsertHrSettings);
  const seedDemo = useServerFn(seedHrDemoWorkforce);

  const [enabled, setEnabled] = useState(false);
  const [timezone, setTimezone] = useState("UTC");
  const [weekStartsOn, setWeekStartsOn] = useState(1);
  const [requireManager, setRequireManager] = useState(true);
  const [disclaimerAck, setDisclaimerAck] = useState(false);
  const [version, setVersion] = useState(1);

  const settingsQ = useQuery({
    queryKey: ["hr-settings", company?.id],
    queryFn: () => fetchSettings({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && (canView || canEdit),
    retry: false,
  });

  useEffect(() => {
    if (!settingsQ.data) return;
    setEnabled(settingsQ.data.enabled);
    setTimezone(settingsQ.data.defaultTimezone);
    setWeekStartsOn(settingsQ.data.weekStartsOn);
    setRequireManager(settingsQ.data.requireManagerForLeave);
    setDisclaimerAck(settingsQ.data.disclaimerAcknowledged);
    setVersion(settingsQ.data.version);
  }, [settingsQ.data]);

  const saveMut = useMutation({
    mutationFn: () =>
      saveSettings({
        data: {
          companyId: company!.id,
          enabled,
          defaultTimezone: timezone,
          weekStartsOn,
          requireManagerForLeave: requireManager,
          disclaimerAcknowledged: disclaimerAck,
          expectedVersion: version,
        },
      }),
    onSuccess: async (data) => {
      toast.success("HR settings saved");
      setVersion(data.version);
      await queryClient.invalidateQueries({ queryKey: ["hr-settings", company?.id] });
      await queryClient.invalidateQueries({ queryKey: ["hr-dashboard-kpis", company?.id] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const seedMut = useMutation({
    mutationFn: () => seedDemo({ data: { companyId: company!.id } }),
    onSuccess: async (res) => {
      if (res.skipped) {
        toast.message(
          res.reason === "not_demo" ? "Only demo companies can be seeded" : "Seed skipped",
        );
        return;
      }
      toast.success(`Demo workforce linked (${res.profilesUpserted} profiles)`);
      await queryClient.invalidateQueries({ queryKey: ["hr-dashboard-kpis", company?.id] });
      await queryClient.invalidateQueries({ queryKey: ["hr-org-units", company?.id] });
      await queryClient.invalidateQueries({ queryKey: ["hr-employees", company?.id] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canEdit && !canView) {
    return (
      <ListWorkspace title="HR Settings" description="Configuration">
        <EmptyState title="No HR access" description="Ask an administrator for hr.settings.edit." />
      </ListWorkspace>
    );
  }

  return (
    <ListWorkspace
      title="HR Settings"
      description="Enable HR and set organisation defaults. Jurisdiction rule packs are not claimed as verified compliance."
      breadcrumbs={[{ label: "HR", to: "/hr" }, { label: "Settings" }]}
      actions={
        canEdit ? (
          <Button type="button" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
            {saveMut.isPending ? "Saving…" : "Save settings"}
          </Button>
        ) : undefined
      }
    >
      <HrSubnav current="settings" />

      {settingsQ.isPending ? (
        <LoadingState />
      ) : settingsQ.isError ? (
        <ErrorState
          title="Could not load HR settings"
          description={friendlyAuthError(settingsQ.error)}
          onRetry={() => settingsQ.refetch()}
        />
      ) : (
        <div className="max-w-xl space-y-6">
          <Alert>
            <AlertTitle>Compliance notice</AlertTitle>
            <AlertDescription>{settingsQ.data?.disclaimer}</AlertDescription>
          </Alert>

          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div>
              <p className="font-medium">Enable HR Management</p>
              <p className="text-sm text-muted-foreground">
                Does not disable Payroll. Shared employee identity stays available to both modules.
              </p>
            </div>
            <Switch checked={enabled} disabled={!canEdit} onCheckedChange={setEnabled} />
          </div>

          <div className="space-y-1">
            <Label htmlFor="hr-tz">Default timezone</Label>
            <Input
              id="hr-tz"
              value={timezone}
              disabled={!canEdit}
              onChange={(e) => setTimezone(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="hr-week">Week starts on (0=Sunday … 6=Saturday)</Label>
            <Input
              id="hr-week"
              type="number"
              min={0}
              max={6}
              value={weekStartsOn}
              disabled={!canEdit}
              onChange={(e) => setWeekStartsOn(Number(e.target.value))}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div>
              <p className="font-medium">Require manager for leave</p>
              <p className="text-sm text-muted-foreground">
                Applied when leave approvals ship in HR-06/HR-07.
              </p>
            </div>
            <Switch
              checked={requireManager}
              disabled={!canEdit}
              onCheckedChange={setRequireManager}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div>
              <p className="font-medium">Acknowledge disclaimer</p>
              <p className="text-sm text-muted-foreground">
                Confirms operators understand HR is not auto-certified for every jurisdiction.
              </p>
            </div>
            <Switch
              checked={disclaimerAck}
              disabled={!canEdit}
              onCheckedChange={setDisclaimerAck}
            />
          </div>

          {company.is_demo && canEdit ? (
            <div className="space-y-3 rounded-lg border border-border p-4">
              <div>
                <p className="font-medium">Seed demo HR workforce</p>
                <p className="text-sm text-muted-foreground">
                  Links existing Payroll demo employees into HR org units and profiles. Demo
                  companies only.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={seedMut.isPending}
                onClick={() => seedMut.mutate()}
              >
                {seedMut.isPending ? "Seeding…" : "Seed from Payroll employees"}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </ListWorkspace>
  );
}
