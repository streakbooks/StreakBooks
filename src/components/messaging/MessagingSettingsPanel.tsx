import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { LoadingState, ErrorState } from "@/components/common/states";
import { useMessagingSettings } from "@/hooks/use-messaging";
import {
  previewMessagingDigest,
  setMessagingCollaborationFlags,
  setMessagingEnabled,
  setMessagingRetentionDays,
} from "@/lib/messaging/messaging.functions";
import { isValidMessagingRetentionDays, messagingRetentionLabel } from "@/lib/messaging/retention";
import { notify } from "@/lib/notify";
import { useCanDo } from "@/hooks/use-can";
import { useState } from "react";
import { Input } from "@/components/ui/input";

/** Organisation messaging administration. Authorization remains server-side. */
export function MessagingSettingsPanel({ companyId }: { companyId: string | null }) {
  const settings = useMessagingSettings(companyId);
  const canManage = useCanDo("messaging.manage_settings");
  const canRetention = useCanDo("messaging.manage_retention");
  const setEnabled = useServerFn(setMessagingEnabled);
  const setFlags = useServerFn(setMessagingCollaborationFlags);
  const setRetention = useServerFn(setMessagingRetentionDays);
  const previewDigest = useServerFn(previewMessagingDigest);
  const client = useQueryClient();
  const [digestPreview, setDigestPreview] = useState<string | null>(null);
  const [retentionDraft, setRetentionDraft] = useState<string>("");

  const invalidate = () => {
    void client.invalidateQueries({ queryKey: ["messaging-settings", companyId] });
  };

  const enabledMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      setEnabled({ data: { companyId: companyId!, enabled } }),
    onSuccess: () => {
      invalidate();
      notify.success("Messaging settings updated");
    },
    onError: (error) => notify.error(error, "Could not update messaging settings"),
  });

  const flagsMutation = useMutation({
    mutationFn: (flags: {
      allowAiAssist?: boolean;
      allowFileShare?: boolean;
      allowCustomer?: boolean;
      allowVendor?: boolean;
      allowGroupCreate?: boolean;
    }) => setFlags({ data: { companyId: companyId!, ...flags } }),
    onSuccess: () => {
      invalidate();
      notify.success("Collaboration flags updated");
    },
    onError: (error) => notify.error(error, "Could not update collaboration flags"),
  });

  const retentionMutation = useMutation({
    mutationFn: (retentionDays: number | null) =>
      setRetention({ data: { companyId: companyId!, retentionDays } }),
    onSuccess: () => {
      invalidate();
      notify.success("Retention updated");
    },
    onError: (error) => notify.error(error, "Could not update retention"),
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
  const busy =
    enabledMutation.isPending || flagsMutation.isPending || retentionMutation.isPending;
  const currentRetention = settings.data?.retention_days ?? null;

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
          disabled={!canManage || busy}
          onCheckedChange={(value) => enabledMutation.mutate(value)}
        />
      </div>

      <div className="space-y-3 border-t pt-4">
        <h4 className="text-sm font-medium">Collaboration flags</h4>
        {(
          [
            {
              id: "allow-groups",
              label: "Allow group create",
              checked: Boolean(settings.data?.allow_group_create),
              key: "allowGroupCreate" as const,
            },
            {
              id: "allow-files",
              label: "Allow file share",
              checked: Boolean(settings.data?.allow_file_share),
              key: "allowFileShare" as const,
            },
            {
              id: "allow-customer",
              label: "Customer portal messaging",
              checked: Boolean(settings.data?.allow_customer),
              key: "allowCustomer" as const,
            },
            {
              id: "allow-vendor",
              label: "Vendor portal messaging",
              checked: Boolean(settings.data?.allow_vendor),
              key: "allowVendor" as const,
            },
            {
              id: "allow-ai",
              label: "AI assist (opt-in)",
              checked: Boolean(settings.data?.allow_ai_assist),
              key: "allowAiAssist" as const,
            },
          ] as const
        ).map((flag) => (
          <div key={flag.id} className="flex items-center justify-between gap-4">
            <Label htmlFor={flag.id}>{flag.label}</Label>
            <Switch
              id={flag.id}
              checked={flag.checked}
              disabled={!canManage || busy || !enabled}
              onCheckedChange={(value) => flagsMutation.mutate({ [flag.key]: value })}
            />
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          Customer/vendor messaging stays off until RLS and portal isolation are verified on
          staging.
        </p>
      </div>

      <div className="space-y-2 border-t pt-4">
        <h4 className="text-sm font-medium">Retention</h4>
        <p className="text-xs text-muted-foreground">
          {messagingRetentionLabel(currentRetention)}. Automatic purge jobs stay off until
          explicitly scheduled; this only stores the policy.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="retention-days">Days (30–3650, blank = indefinite)</Label>
            <Input
              id="retention-days"
              inputMode="numeric"
              className="w-40"
              value={retentionDraft}
              placeholder={currentRetention == null ? "" : String(currentRetention)}
              onChange={(event) => setRetentionDraft(event.target.value)}
              disabled={!canRetention || busy}
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!canRetention || busy}
            onClick={() => {
              const trimmed = retentionDraft.trim();
              if (!trimmed) {
                retentionMutation.mutate(null);
                return;
              }
              const days = Number(trimmed);
              if (!isValidMessagingRetentionDays(days)) {
                notify.warning("Invalid retention", "Enter 30–3650 days, or leave blank.");
                return;
              }
              retentionMutation.mutate(days);
            }}
          >
            Save retention
          </Button>
        </div>
        {!canRetention ? (
          <p className="text-xs text-muted-foreground">
            Changing retention requires messaging.manage_retention.
          </p>
        ) : null}
      </div>

      <div className="space-y-2 border-t pt-4">
        <h4 className="text-sm font-medium">Digest preview</h4>
        <p className="text-xs text-muted-foreground">
          Builds a safe unread digest locally. HR/private and sensitive previews are omitted.
          Sending email still requires a configured worker.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            void previewDigest({ data: { companyId, frequency: "daily" } })
              .then((preview) => {
                const lines = preview.items
                  .map((item) => `• ${item.title}: ${item.summary}`)
                  .join("\n");
                setDigestPreview(
                  `${preview.subject}\n${lines || "(no unread items)"}\nOmitted sensitive: ${preview.omittedSensitive}`,
                );
              })
              .catch((error) => notify.error(error, "Could not preview digest"));
          }}
        >
          Preview daily digest
        </Button>
        {digestPreview ? (
          <pre className="max-h-40 overflow-auto rounded border bg-muted/30 p-3 text-xs whitespace-pre-wrap">
            {digestPreview}
          </pre>
        ) : null}
      </div>

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
