import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { LookupSelect } from "@/components/lookup";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { getFirmClientName, type FirmClientRow } from "@/lib/firm/client-portfolio";
import { listFirmOnboardingOverview } from "@/lib/firm/firm-workflows.functions";
import {
  listFirmOnboardingWorkloadContext,
  saveFirmOnboardingCapacity,
} from "@/lib/firm/firm-onboarding-workload.functions";
import {
  onboardingCompletionReport,
  onboardingTaskQueue,
  staffOnboardingWorkload,
} from "@/lib/firm/firm-onboarding-workload";

const statusLabels = {
  overdue: "Overdue",
  due_soon: "Due soon",
  blocked: "Blocked",
  scheduled: "Scheduled",
  unscheduled: "No date",
} as const;

export function FirmOnboardingWorkloadPanel({
  firmId,
  clients,
  onChooseClient,
}: {
  firmId: string;
  clients: FirmClientRow[];
  onChooseClient: (companyId: string) => void;
}) {
  const overviewFn = useServerFn(listFirmOnboardingOverview);
  const rosterFn = useServerFn(listFirmOnboardingWorkloadContext);
  const saveFn = useServerFn(saveFirmOnboardingCapacity);
  const qc = useQueryClient();
  const [selectedStaff, setSelectedStaff] = useState("");
  const [limitDraft, setLimitDraft] = useState<{ userId: string; value: string } | null>(null);
  const contextQ = useQuery({
    queryKey: ["firm-onboarding-workload-context", firmId],
    queryFn: () => rosterFn({ data: { firmId } }),
    enabled: Boolean(firmId),
  });
  const overviewQ = useQuery({
    queryKey: ["firm-onboarding-overview", firmId],
    queryFn: () => overviewFn({ data: { firmId } }),
    enabled: Boolean(firmId),
  });
  const capacityM = useMutation({
    mutationFn: (input: { userId: string; expectedVersion: number; maxOpenSteps: number }) =>
      saveFn({ data: { firmId, ...input } }),
    onSuccess: async () => {
      setLimitDraft(null);
      await qc.invalidateQueries({ queryKey: ["firm-onboarding-workload-context", firmId] });
      toast.success("Staff workload capacity saved");
    },
    onError: (error) => {
      void qc.invalidateQueries({ queryKey: ["firm-onboarding-workload-context", firmId] });
      toast.error(friendlyAuthError(error) + " Refresh and retry.");
    },
  });
  const today = new Date().toISOString().slice(0, 10);
  const staff = contextQ.data?.staff ?? [];
  const viewerId = contextQ.data?.viewerId ?? "";
  const selectedId = staff.some((member) => member.user_id === selectedStaff)
    ? selectedStaff
    : viewerId;
  const selected = staff.find((member) => member.user_id === selectedId);
  const rows = useMemo(() => overviewQ.data ?? [], [overviewQ.data]);
  const report = useMemo(() => onboardingCompletionReport(rows, today), [rows, today]);
  const taskQueue = useMemo(
    () => onboardingTaskQueue(rows, selectedId, today),
    [rows, selectedId, today],
  );
  const workload = useMemo(
    () => staffOnboardingWorkload(rows, selectedId, selected?.max_open_steps ?? 20, today),
    [rows, selectedId, selected?.max_open_steps, today],
  );
  const names = useMemo(
    () =>
      new Map(
        clients
          .filter((client) => Boolean(client.companies))
          .map((client) => [client.company_id, getFirmClientName(client)]),
      ),
    [clients],
  );
  const draft =
    limitDraft?.userId === selectedId ? limitDraft.value : String(selected?.max_open_steps ?? 20);
  const parsedLimit = Number(draft);
  const validLimit =
    /^\d{1,3}$/.test(draft) &&
    Number.isInteger(parsedLimit) &&
    parsedLimit >= 1 &&
    parsedLimit <= 200;

  return (
    <section
      className="space-y-4 rounded-lg border bg-card p-4"
      aria-label="Staff onboarding workload and task queue"
    >
      <div>
        <h3 className="font-semibold">Staff onboarding workload</h3>
        <p className="text-sm text-muted-foreground">
          Workloads count only checklist steps in clients you can access. Capacity is an advisory
          target; it never changes staff permissions.
        </p>
      </div>
      {contextQ.isError || overviewQ.isError ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-destructive">
            Could not load workload: {friendlyAuthError(contextQ.error ?? overviewQ.error)}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void contextQ.refetch();
              void overviewQ.refetch();
            }}
          >
            Retry
          </Button>
        </div>
      ) : contextQ.isPending || overviewQ.isPending ? (
        <p className="text-sm text-muted-foreground">Loading staff workload…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ["Clients with checklists", report.clientCount],
                ["Fully completed clients", report.fullyCompletedClients],
                ["Steps completed", `${report.completedSteps} / ${report.totalSteps}`],
                ["Completion", `${report.completionPercent}%`],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <Label>View tasks assigned to</Label>
              <LookupSelect
                ariaLabel="Select staff workload"
                allowClear={false}
                value={selectedId}
                onChange={(value) => {
                  setSelectedStaff(value);
                  setLimitDraft(null);
                }}
                options={staff.map((member) => ({
                  id: member.user_id,
                  name:
                    member.user_id === viewerId
                      ? `${member.display_name} (me)`
                      : member.display_name,
                  label: member.display_name,
                }))}
                searchPlaceholder="Find a firm colleague"
              />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(
                  [
                    ["Open", workload.assignedOpen],
                    ["Overdue", workload.overdue],
                    ["Due soon", workload.dueSoon],
                    ["Blocked", workload.blocked],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="rounded-md border p-2">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-base font-semibold tabular-nums">{value}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    Capacity: {workload.assignedOpen} / {workload.capacity} open steps
                  </p>
                  {workload.overCapacity && <Badge variant="destructive">Above capacity</Badge>}
                </div>
                <div
                  className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-label="Staff capacity utilization"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.min(100, workload.utilizationPercent)}
                >
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${Math.min(100, workload.utilizationPercent)}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {workload.utilizationPercent}% of configured capacity (based on accessible
                  assigned work).
                </p>
                {contextQ.data?.canManage && selected && (
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    <div className="w-40 space-y-1">
                      <Label htmlFor="firm-capacity-limit">Target open steps (1–200)</Label>
                      <Input
                        id="firm-capacity-limit"
                        type="number"
                        min={1}
                        max={200}
                        value={draft}
                        disabled={capacityM.isPending}
                        onChange={(event) =>
                          setLimitDraft({
                            userId: selectedId,
                            value: event.target.value,
                          })
                        }
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={
                        capacityM.isPending ||
                        !validLimit ||
                        parsedLimit === selected.max_open_steps
                      }
                      onClick={() =>
                        capacityM.mutate({
                          userId: selectedId,
                          expectedVersion: selected.version,
                          maxOpenSteps: parsedLimit,
                        })
                      }
                    >
                      {capacityM.isPending ? "Saving…" : "Save capacity"}
                    </Button>
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Assigned task queue ({taskQueue.length})</h4>
              {taskQueue.length === 0 ? (
                <p className="rounded-md border p-4 text-sm text-muted-foreground">
                  No outstanding onboarding tasks assigned to this colleague in accessible clients.
                </p>
              ) : (
                <div className="max-h-96 space-y-2 overflow-y-auto">
                  {taskQueue.slice(0, 40).map((task) => (
                    <div
                      key={task.company_id + ":" + task.task_key}
                      className="flex flex-wrap items-center gap-2 rounded-md border p-3"
                    >
                      <div className="min-w-44 flex-1">
                        <p className="text-sm font-medium">{task.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {names.get(task.company_id) ?? "Client"}
                          {task.due_date ? ` · Due ${task.due_date}` : " · No due date"}
                        </p>
                      </div>
                      <Badge variant={task.status === "overdue" ? "destructive" : "outline"}>
                        {statusLabels[task.status]}
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onChooseClient(task.company_id)}
                      >
                        Open
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              {taskQueue.length > 40 && (
                <p className="text-xs text-muted-foreground">
                  Showing the first 40 urgent tasks. Open a client checklist for more.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
