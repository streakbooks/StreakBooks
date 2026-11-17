import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { LoadingState, ErrorState } from "@/components/common/states";
import {
  getMessagingNotificationPreferences,
  saveMessagingNotificationPreferences,
} from "@/lib/messaging/messaging.functions";
import { notify } from "@/lib/notify";
import {
  getMessagingPushPermissionState,
  messagingPushPermissionLabel,
  requestMessagingPushPermission,
} from "@/lib/messaging/push-permission";

type Prefs = {
  email_enabled: boolean;
  push_enabled: boolean;
  mention_only: boolean;
  digest_frequency: string;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
};

export function MessagingNotificationPreferences({ companyId }: { companyId: string | null }) {
  const fetchPrefs = useServerFn(getMessagingNotificationPreferences);
  const savePrefs = useServerFn(saveMessagingNotificationPreferences);
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["messaging-notification-prefs", companyId],
    enabled: Boolean(companyId),
    queryFn: () => fetchPrefs({ data: { companyId: companyId! } }) as Promise<Prefs>,
  });
  const [draft, setDraft] = useState<Prefs | null>(null);
  const [pushState, setPushState] = useState(getMessagingPushPermissionState);

  useEffect(() => {
    if (query.data) setDraft(query.data);
  }, [query.data]);

  const mutation = useMutation({
    mutationFn: () => {
      const payload: {
        companyId: string;
        emailEnabled: boolean;
        pushEnabled: boolean;
        mentionOnly: boolean;
        digestFrequency: "off" | "daily" | "weekly";
        quietHoursStart?: string | null;
        quietHoursEnd?: string | null;
      } = {
        companyId: companyId!,
        emailEnabled: draft?.email_enabled ?? true,
        pushEnabled: draft?.push_enabled ?? false,
        mentionOnly: draft?.mention_only ?? false,
        digestFrequency:
          draft?.digest_frequency === "daily" || draft?.digest_frequency === "weekly"
            ? draft.digest_frequency
            : "off",
      };
      if (draft?.quiet_hours_start != null) payload.quietHoursStart = draft.quiet_hours_start;
      else payload.quietHoursStart = null;
      if (draft?.quiet_hours_end != null) payload.quietHoursEnd = draft.quiet_hours_end;
      else payload.quietHoursEnd = null;
      return savePrefs({ data: payload });
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["messaging-notification-prefs", companyId] });
      notify.success("Notification preferences saved");
    },
    onError: (error) => notify.error(error, "Could not save preferences"),
  });

  if (!companyId) return null;
  if (query.isPending || !draft) return <LoadingState rows={3} />;
  if (query.isError) {
    return (
      <ErrorState
        title="Could not load notification preferences"
        onRetry={() => void query.refetch()}
      />
    );
  }

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div>
        <h3 className="text-base font-semibold">Your messaging notifications</h3>
        <p className="text-sm text-muted-foreground">
          Prefs are personal. Previews never include payroll figures or bank details.
        </p>
      </div>
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="msg-email">Email alerts</Label>
        <Switch
          id="msg-email"
          checked={draft.email_enabled}
          onCheckedChange={(value) => setDraft({ ...draft, email_enabled: value })}
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="msg-push">Browser / push (when supported)</Label>
          <Switch
            id="msg-push"
            checked={draft.push_enabled}
            onCheckedChange={(value) => setDraft({ ...draft, push_enabled: value })}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{messagingPushPermissionLabel(pushState)}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              void requestMessagingPushPermission().then((state) => {
                setPushState(state);
                if (state === "granted") {
                  setDraft({ ...draft, push_enabled: true });
                  notify.success("Browser notifications allowed");
                } else if (state === "denied") {
                  notify.warning(
                    "Notifications blocked",
                    "Enable notifications in the browser settings if you change your mind.",
                  );
                } else if (state === "unsupported") {
                  notify.info("Unsupported", "This browser does not support notifications.");
                }
              });
            }}
          >
            Request browser permission
          </Button>
        </div>
      </div>
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="msg-mention">Mentions only</Label>
        <Switch
          id="msg-mention"
          checked={draft.mention_only}
          onCheckedChange={(value) => setDraft({ ...draft, mention_only: value })}
        />
      </div>
      <div className="space-y-2">
        <Label>Digest</Label>
        <Select
          value={draft.digest_frequency || "off"}
          onValueChange={(value) => setDraft({ ...draft, digest_frequency: value })}
        >
          <SelectTrigger aria-label="Digest frequency">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="off">Off</SelectItem>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="quiet-start">Quiet hours start</Label>
          <Input
            id="quiet-start"
            type="time"
            value={draft.quiet_hours_start?.slice(0, 5) ?? ""}
            onChange={(event) =>
              setDraft({
                ...draft,
                quiet_hours_start: event.target.value ? `${event.target.value}:00` : null,
              })
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="quiet-end">Quiet hours end</Label>
          <Input
            id="quiet-end"
            type="time"
            value={draft.quiet_hours_end?.slice(0, 5) ?? ""}
            onChange={(event) =>
              setDraft({
                ...draft,
                quiet_hours_end: event.target.value ? `${event.target.value}:00` : null,
              })
            }
          />
        </div>
      </div>
      <Button type="button" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? "Saving…" : "Save preferences"}
      </Button>
    </div>
  );
}
