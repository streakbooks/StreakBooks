import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { LoadingState, ErrorState } from "@/components/common/states";
import { useMessagingSettings } from "@/hooks/use-messaging";
import { setMessagingEnabled } from "@/lib/messaging/messaging.functions";
import { notify } from "@/lib/notify";
import { useCanDo } from "@/hooks/use-can";

/** Organisation messaging administration. Authorization remains server-side. */
export function MessagingSettingsPanel({ companyId }: { companyId: string | null }) {
  const settings = useMessagingSettings(companyId);
  const canManage = useCanDo("messaging.manage_settings");
  const setEnabled = useServerFn(setMessagingEnabled);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: (enabled: boolean) =>
      setEnabled({ data: { companyId: companyId!, enabled } }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["messaging-settings", companyId] });
      notify.success("Messaging settings updated");
    },
    onError: (error) => notify.error(error, "Could not update messaging settings"),
  });

  if (!companyId) return null;
  if (settings.isPending) return <LoadingState />;
  if (settings.isError) {
    return (
      <ErrorState
        title="Messaging settings unavailable"
        description="Could not load messaging configuration."
        onRetry={() => void settings.refetch()}
      />
    );
  }

  const enabled = settings.data?.enabled ?? false;

  return (
    <div className="space-y-6 rounded-lg border bg-card p-4">
      <div>
        <h3 className="text-base font-semibold">Messaging &amp; collaboration</h3>
        <p className="text-sm text-muted-foreground">
          Controls organisation messaging. Chat never posts journals, pays bills or approves
          payroll by itself. Formal approvals use existing LinkBooks engines.
        </p>
      </div>
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <Label htmlFor="messaging-enabled">Enable messaging</Label>
          <p className="text-xs text-muted-foreground">
            When off, create and send APIs reject requests even if UI is reachable.
          </p>
        </div>
        <Switch
          id="messaging-enabled"
          checked={enabled}
          disabled={!canManage || mutation.isPending}
          onCheckedChange={(value) => mutation.mutate(value)}
        />
      </div>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Internal chat</dt>
          <dd>{settings.data?.allow_internal ? "Allowed" : "Blocked"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Groups</dt>
          <dd>{settings.data?.allow_group_create ? "Allowed" : "Blocked"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Customer messaging</dt>
          <dd>{settings.data?.allow_customer ? "Allowed" : "Blocked"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Vendor messaging</dt>
          <dd>{settings.data?.allow_vendor ? "Allowed" : "Blocked"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">AI assist</dt>
          <dd>{settings.data?.allow_ai_assist ? "Opt-in available" : "Off"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Voice / video</dt>
          <dd>{settings.data?.allow_voice_video ? "Configurable" : "Off"}</dd>
        </div>
      </dl>
      {!canManage && (
        <p className="text-xs text-muted-foreground">
          You can view these settings. Changing them requires messaging.manage_settings.
        </p>
      )}
      <Button type="button" variant="outline" asChild>
        <Link to="/messages" search={{ filter: "inbox" }}>
          Open Messages workspace
        </Link>
      </Button>
    </div>
  );
}
