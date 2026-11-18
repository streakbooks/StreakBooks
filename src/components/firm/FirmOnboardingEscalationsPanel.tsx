import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { getFirmClientName, type FirmClientRow } from "@/lib/firm/client-portfolio";
import {
  listFirmOnboardingEscalationHistory,
  listFirmOnboardingEscalationPolicy,
  saveFirmOnboardingEscalationPolicy,
} from "@/lib/firm/firm-onboarding-escalations.functions";
import { listFirmOnboardingWorkloadContext } from "@/lib/firm/firm-onboarding-workload.functions";

type EscalationDraft = {
  firmId: string;
  enabled: boolean;
  firstDays: string;
  repeatDays: string;
};

export function FirmOnboardingEscalationsPanel({
  firmId,
  clients,
  canManage,
}: {
  firmId: string;
  clients: FirmClientRow[];
  canManage: boolean;
}) {
  const policyFn = useServerFn(listFirmOnboardingEscalationPolicy);
  const historyFn = useServerFn(listFirmOnboardingEscalationHistory);
  const contextFn = useServerFn(listFirmOnboardingWorkloadContext);
  const saveFn = useServerFn(saveFirmOnboardingEscalationPolicy);
  const qc = useQueryClient();
  const [draft, setDraft] = useState<EscalationDraft | null>(null);
  const policyQ = useQuery({
    queryKey: ["firm-onboarding-escalation-policy", firmId],
    queryFn: () => policyFn({ data: { firmId } }),
    enabled: canManage && Boolean(firmId),
  });
  const historyQ = useQuery({
    queryKey: ["firm-onboarding-escalation-history", firmId],
    queryFn: () => historyFn({ data: { firmId } }),
    enabled: canManage && Boolean(firmId),
  });
  const rosterQ = useQuery({
    queryKey: ["firm-onboarding-workload-context", firmId],
    queryFn: () => contextFn({ data: { firmId } }),
    enabled: canManage && Boolean(firmId),
  });
  const saveM = useMutation({
    mutationFn: (values: { enabled: boolean; firstDays: number; repeatDays: number }) =>
      saveFn({
        data: {
          firmId,
          expectedVersion: policyQ.data?.version ?? 0,
          enabled: values.enabled,
          firstOverdueDays: values.firstDays,
          repeatEveryDays: values.repeatDays,
        },
      }),
    onSuccess: async () => {
      setDraft(null);
      await qc.invalidateQueries({ queryKey: ["firm-onboarding-escalation-policy", firmId] });
      toast.success("Firm overdue escalation settings saved");
    },
    onError: (error) => {
      void qc.invalidateQueries({ queryKey: ["firm-onboarding-escalation-policy", firmId] });
      toast.error(friendlyAuthError(error));
    },
  });
  if (!canManage) return null;
  const policy = policyQ.data;
  const effective =
    draft?.firmId === firmId
      ? draft
      : {
          firmId,
          enabled: policy?.enabled ?? false,
          firstDays: String(policy?.first_overdue_days ?? 3),
          repeatDays: String(policy?.repeat_every_days ?? 7),
        };
  function change(patch: Partial<EscalationDraft>) {
    setDraft({ ...effective, ...patch });
  }
  const first = Number(effective.firstDays);
  const repeat = Number(effective.repeatDays);
  const valid =
    /^\d{1,2}$/.test(effective.firstDays) &&
    /^\d{1,2}$/.test(effective.repeatDays) &&
    first >= 1 &&
    first <= 30 &&
    repeat >= 1 &&
    repeat <= 30;
  const modified =
    effective.enabled !== (policy?.enabled ?? false) ||
    first !== (policy?.first_overdue_days ?? 3) ||
    repeat !== (policy?.repeat_every_days ?? 7);
  const clientNames = new Map(
    clients.map((client) => [client.company_id, getFirmClientName(client)]),
  );
  const staffNames = new Map(
    (rosterQ.data?.staff ?? []).map((member) => [member.user_id, member.display_name]),
  );

  return (
    <details className="rounded-lg border bg-card p-4">
      <summary className="cursor-pointer font-semibold">Manager overdue escalations</summary>
      <p className="mt-2 text-sm text-muted-foreground">
        Optional in-app escalation notices go to assigned client leads/managers only when their firm
        membership, company membership and accounting-view permissions remain valid. No email or SMS
        is sent.
      </p>
      {policyQ.isPending ? (
        <p className="mt-3 text-sm text-muted-foreground">Loading escalation policy…</p>
      ) : policyQ.isError ? (
        <div className="mt-3 flex items-center gap-2">
          <p className="text-sm text-destructive">{friendlyAuthError(policyQ.error)}</p>
          <Button variant="outline" size="sm" onClick={() => void policyQ.refetch()}>
            Retry
          </Button>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id="firm-escalation-enabled"
              checked={effective.enabled}
              disabled={saveM.isPending}
              onCheckedChange={(checked) => change({ enabled: checked === true })}
            />
            <Label htmlFor="firm-escalation-enabled">Enable manager escalations</Label>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-40 space-y-1">
              <Label htmlFor="firm-escalation-first">First alert after (days overdue)</Label>
              <Input
                id="firm-escalation-first"
                type="number"
                min={1}
                max={30}
                value={effective.firstDays}
                disabled={saveM.isPending}
                onChange={(event) => change({ firstDays: event.target.value })}
              />
            </div>
            <div className="w-40 space-y-1">
              <Label htmlFor="firm-escalation-repeat">Repeat every (days)</Label>
              <Input
                id="firm-escalation-repeat"
                type="number"
                min={1}
                max={30}
                value={effective.repeatDays}
                disabled={saveM.isPending}
                onChange={(event) => change({ repeatDays: event.target.value })}
              />
            </div>
            <Button
              size="sm"
              disabled={saveM.isPending || !valid || !modified}
              onClick={() =>
                saveM.mutate({
                  enabled: effective.enabled,
                  firstDays: first,
                  repeatDays: repeat,
                })
              }
            >
              {saveM.isPending ? "Saving…" : "Save escalation policy"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Changes take effect only after saving. Daily at 01:35 UTC; overdue alerts stop after day
            365. A manager must have an existing lead or manager assignment for the client. Existing
            assigned-staff reminders operate independently.
          </p>
        </div>
      )}
      <div className="mt-4 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold">Recent manager escalations</h4>
          <Button
            size="sm"
            variant="outline"
            disabled={historyQ.isFetching}
            onClick={() => void historyQ.refetch()}
          >
            Refresh history
          </Button>
        </div>
        {historyQ.isPending ? (
          <p className="text-sm text-muted-foreground">Loading history…</p>
        ) : historyQ.isError ? (
          <p className="text-sm text-destructive">{friendlyAuthError(historyQ.error)}</p>
        ) : (historyQ.data ?? []).length ? (
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {(historyQ.data ?? []).map((event) => (
              <div key={event.id} className="rounded-md border px-3 py-2 text-sm">
                <p className="font-medium">
                  {clientNames.get(event.company_id) ?? "Authorized client"}
                  {" · "}
                  {event.task_key.replaceAll("_", " ")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {event.escalated_on} · {event.overdue_days} days overdue
                  {" · "}To {staffNames.get(event.recipient_user_id) ?? "Firm colleague"}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No manager escalations recorded for clients you can access.
          </p>
        )}
      </div>
    </details>
  );
}
