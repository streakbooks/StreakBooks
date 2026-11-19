import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { LookupSelect } from "@/components/lookup";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { LoadingState, EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { listAssignableFirmMembers } from "@/lib/firm/firm-assignments.functions";
import {
  onboardingCanComplete,
  onboardingCanReopen,
  onboardingDependencyChoices,
  onboardingStepSummary,
} from "@/lib/firm/onboarding-insights";
import { FirmOnboardingDashboard } from "@/components/firm/FirmOnboardingDashboard";
import { FirmOnboardingWorkloadPanel } from "@/components/firm/FirmOnboardingWorkloadPanel";
import { FirmOnboardingReportingPanel } from "@/components/firm/FirmOnboardingReportingPanel";
import { FirmOnboardingEscalationsPanel } from "@/components/firm/FirmOnboardingEscalationsPanel";
import {
  ONBOARDING_TEMPLATE,
  OFFBOARDING_TEMPLATE,
  initializeFirmOffboarding,
  initializeFirmOnboarding,
  listFirmOnboardingSteps,
  listFirmTeam,
  updateFirmOnboardingStep,
  saveFirmOnboardingPlan,
  type FirmOnboardingPlanInput,
} from "@/lib/firm/firm-workflows.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { getFirmClientName, type FirmClientRow } from "@/lib/firm/client-portfolio";
import { FirmCustomOnboardingTemplates } from "@/components/firm/FirmCustomOnboardingTemplates";
import { MeasuredProgress } from "@/components/common/MeasuredProgress";

type StepPlan = Omit<FirmOnboardingPlanInput, "firmId" | "companyId" | "task_key" | "version">;

function FirmClientPicker({
  clients,
  value,
  onChange,
}: {
  clients: FirmClientRow[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="max-w-md space-y-1">
      <Label>Client organisation</Label>
      <LookupSelect
        ariaLabel="Select practice client"
        allowClear={false}
        value={value}
        onChange={onChange}
        searchPlaceholder="Search practice clients"
        options={clients
          .filter((client) => Boolean(client.companies))
          .map((client) => ({
            id: client.company_id,
            name: getFirmClientName(client),
            label: getFirmClientName(client),
          }))}
      />
    </div>
  );
}

export function FirmOnboardingPanel({
  firmId,
  clients,
  canManage,
}: {
  firmId: string;
  clients: FirmClientRow[];
  canManage: boolean;
}) {
  const available = clients.filter((client) => Boolean(client.companies));
  const [selected, setSelected] = useState("");
  const clientId = available.some((client) => client.company_id === selected)
    ? selected
    : available[0]?.company_id || "";
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [plans, setPlans] = useState<Record<string, StepPlan>>({});
  const list = useServerFn(listFirmOnboardingSteps);
  const initialize = useServerFn(initializeFirmOnboarding);
  const initializeOffboarding = useServerFn(initializeFirmOffboarding);
  const update = useServerFn(updateFirmOnboardingStep);
  const savePlan = useServerFn(saveFirmOnboardingPlan);
  const listAssignees = useServerFn(listAssignableFirmMembers);
  const qc = useQueryClient();
  const queryKey = ["firm-onboarding-steps", firmId, clientId];
  const stepsQ = useQuery({
    queryKey,
    enabled: Boolean(clientId),
    queryFn: () => list({ data: { firmId, companyId: clientId } }),
  });
  const assigneesQ = useQuery({
    queryKey: ["firm-onboarding-eligible-assignees", firmId, clientId],
    enabled: Boolean(clientId),
    queryFn: () => listAssignees({ data: { firmId, companyId: clientId } }),
  });
  const createM = useMutation({
    mutationFn: () => initialize({ data: { firmId, companyId: clientId } }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey }),
        qc.invalidateQueries({ queryKey: ["firm-onboarding-overview", firmId] }),
      ]);
      toast.success("Standard onboarding checklist added");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const offboardM = useMutation({
    mutationFn: () => initializeOffboarding({ data: { firmId, companyId: clientId } }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey }),
        qc.invalidateQueries({ queryKey: ["firm-onboarding-overview", firmId] }),
      ]);
      toast.success("Offboarding checklist added without revoking client access");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const updateM = useMutation({
    mutationFn: (data: { task_key: string; version: number; complete: boolean; note: string }) =>
      update({ data: { ...data, firmId, companyId: clientId } }),
    onSuccess: async () => {
      setNotes({});
      await Promise.all([
        qc.invalidateQueries({ queryKey }),
        qc.invalidateQueries({ queryKey: ["firm-onboarding-overview", firmId] }),
      ]);
      toast.success("Checklist updated");
    },
    onError: async (error) => {
      await qc.invalidateQueries({ queryKey });
      toast.error(friendlyAuthError(error));
    },
  });
  const planM = useMutation({
    mutationFn: (data: Omit<FirmOnboardingPlanInput, "firmId" | "companyId">) =>
      savePlan({ data: { ...data, firmId, companyId: clientId } }),
    onSuccess: async () => {
      setPlans({});
      await Promise.all([
        qc.invalidateQueries({ queryKey }),
        qc.invalidateQueries({ queryKey: ["firm-onboarding-overview", firmId] }),
      ]);
      toast.success("Onboarding ownership and schedule saved");
    },
    onError: async (error) => {
      await qc.invalidateQueries({ queryKey });
      toast.error(friendlyAuthError(error));
    },
  });
  const steps = stepsQ.data ?? [];
  const metrics = onboardingStepSummary(steps, new Date().toISOString().slice(0, 10));
  function changePlan(key: string, step: StepPlan, patch: Partial<StepPlan>) {
    setPlans((current) => ({ ...current, [key]: { ...step, ...patch } }));
  }

  return (
    <section className="space-y-5" aria-label="Client onboarding">
      <div>
        <h2 className="text-lg font-semibold">Client onboarding checklist</h2>
        <p className="text-sm text-muted-foreground">
          Track opening records, scope, access and independent client setup work. Completion does
          not automatically grant access or change accounting data.
        </p>
      </div>
      {available.length === 0 ? (
        <EmptyState
          title="Link a client first"
          description="Onboarding records are only available for linked client organisations."
        />
      ) : (
        <>
          <FirmClientPicker
            clients={available}
            value={clientId}
            onChange={(value) => {
              setSelected(value);
              setNotes({});
              setPlans({});
            }}
          />
          <FirmOnboardingDashboard
            firmId={firmId}
            clients={available}
            onChooseClient={(companyId) => {
              setSelected(companyId);
              setNotes({});
              setPlans({});
            }}
          />
          <FirmOnboardingWorkloadPanel
            firmId={firmId}
            clients={available}
            onChooseClient={(companyId) => {
              setSelected(companyId);
              setNotes({});
              setPlans({});
            }}
          />
          <FirmOnboardingReportingPanel
            firmId={firmId}
            clients={available}
            onChooseClient={(companyId) => {
              setSelected(companyId);
              setNotes({});
              setPlans({});
            }}
          />
          <FirmOnboardingEscalationsPanel
            firmId={firmId}
            clients={available}
            canManage={canManage}
          />
          <FirmCustomOnboardingTemplates
            firmId={firmId}
            companyId={clientId}
            canManage={canManage}
          />
          {stepsQ.isPending ? (
            <LoadingState />
          ) : stepsQ.isError ? (
            <QueryErrorState queries={[stepsQ]} title="Could not load onboarding" />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
                <div className="min-w-[16rem] flex-1 space-y-2">
                  <MeasuredProgress
                    completed={metrics.completed}
                    total={steps.length}
                    unit="checklist items"
                    emptyLabel="No checklist created for this client yet."
                  />
                  <p className="text-sm text-muted-foreground">
                    Checklists are operational evidence, not automatic accounting approval.
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {metrics.overdue} overdue · {metrics.dueSoon} due within 3 days ·{" "}
                    {metrics.blocked} blocked · {metrics.unassigned} unassigned
                  </p>
                </div>
                {canManage ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={createM.isPending}
                      onClick={() => createM.mutate()}
                    >
                      {createM.isPending ? "Creating…" : "Add missing standard steps"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={offboardM.isPending}
                      onClick={() => offboardM.mutate()}
                    >
                      {offboardM.isPending ? "Creating…" : "Add offboarding steps"}
                    </Button>
                  </div>
                ) : null}
              </div>
              {steps.length === 0 ? (
                <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
                  The onboarding template contains {ONBOARDING_TEMPLATE.length} steps; the
                  offboarding template contains {OFFBOARDING_TEMPLATE.length}. A firm administrator
                  can add them without overwriting previously completed work.
                </div>
              ) : (
                <div className="space-y-3">
                  {steps.map((step) => {
                    const note = notes[step.task_key] ?? step.note;
                    const completed = Boolean(step.completed_at);
                    const plan: StepPlan = plans[step.task_key] ?? {
                      assignee_id: step.assignee_id,
                      due_date: step.due_date,
                      depends_on_task_key: step.depends_on_task_key,
                      reminders_enabled: step.reminders_enabled,
                    };
                    const planChanged =
                      plan.assignee_id !== step.assignee_id ||
                      plan.due_date !== step.due_date ||
                      plan.depends_on_task_key !== step.depends_on_task_key ||
                      plan.reminders_enabled !== step.reminders_enabled;
                    const blocked = !completed && !onboardingCanComplete(step, steps);
                    const cannotReopen = completed && !onboardingCanReopen(step, steps);
                    return (
                      <div key={step.task_key} className="rounded-lg border bg-card p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="font-medium">{step.title}</div>
                          <Badge variant={completed ? "secondary" : "outline"}>
                            {completed ? "Complete" : blocked ? "Blocked" : "Pending"}
                          </Badge>
                        </div>
                        {completed && step.completed_at ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Completed {new Date(step.completed_at).toLocaleString()}
                          </p>
                        ) : null}
                        {step.due_date && !completed ? (
                          <p
                            className={
                              step.due_date < new Date().toISOString().slice(0, 10)
                                ? "mt-1 text-xs font-medium text-destructive"
                                : "mt-1 text-xs text-muted-foreground"
                            }
                          >
                            Due {step.due_date}
                          </p>
                        ) : null}
                        <p className="mt-1 text-xs text-muted-foreground">
                          Assigned:{" "}
                          {step.assignee_id
                            ? (assigneesQ.data ?? []).find(
                                (member) => member.user_id === step.assignee_id,
                              )?.full_name ||
                              (assigneesQ.data ?? []).find(
                                (member) => member.user_id === step.assignee_id,
                              )?.email ||
                              "Assigned colleague"
                            : "Unassigned"}
                          {" · "}
                          {step.reminders_enabled ? "In-app reminders enabled" : "Reminders off"}
                          {step.depends_on_task_key
                            ? ` · Depends on ${
                                steps.find(
                                  (candidate) => candidate.task_key === step.depends_on_task_key,
                                )?.title ?? "another step"
                              }`
                            : ""}
                        </p>
                        {blocked ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Finish the prerequisite checklist item before completing this step.
                          </p>
                        ) : null}
                        <div className="mt-3 space-y-2">
                          <Label htmlFor={"onboarding-note-" + step.task_key}>
                            Evidence / follow-up note
                          </Label>
                          <Input
                            id={"onboarding-note-" + step.task_key}
                            maxLength={1000}
                            value={note}
                            readOnly={!canManage}
                            onChange={(event) =>
                              setNotes((current) => ({
                                ...current,
                                [step.task_key]: event.target.value,
                              }))
                            }
                            placeholder="Add operational evidence or next action"
                          />
                          {canManage ? (
                            <>
                              <details className="rounded-md border p-3">
                                <summary className="cursor-pointer text-sm font-medium">
                                  Edit assignment, due date and prerequisite
                                </summary>
                                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                  <div className="space-y-1">
                                    <Label>Assigned staff</Label>
                                    <LookupSelect
                                      ariaLabel={`Assign ${step.title}`}
                                      allowClear
                                      value={plan.assignee_id ?? ""}
                                      onChange={(value) =>
                                        changePlan(step.task_key, plan, {
                                          assignee_id: value || null,
                                        })
                                      }
                                      searchPlaceholder="Search eligible staff"
                                      disabled={assigneesQ.isPending || assigneesQ.isError}
                                      options={(assigneesQ.data ?? []).map((member) => ({
                                        id: member.user_id,
                                        name: member.full_name || member.email || "Colleague",
                                        label: member.full_name || member.email || "Colleague",
                                      }))}
                                    />
                                    {assigneesQ.isError ? (
                                      <QueryErrorState
                                        queries={[assigneesQ]}
                                        title="Eligible staff unavailable"
                                      />
                                    ) : null}
                                  </div>
                                  <div className="space-y-1">
                                    <Label htmlFor={"onboarding-due-" + step.task_key}>
                                      Due date
                                    </Label>
                                    <Input
                                      id={"onboarding-due-" + step.task_key}
                                      type="date"
                                      value={plan.due_date ?? ""}
                                      onChange={(event) =>
                                        changePlan(step.task_key, plan, {
                                          due_date: event.target.value || null,
                                        })
                                      }
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label>Prerequisite</Label>
                                    <LookupSelect
                                      ariaLabel={`Prerequisite for ${step.title}`}
                                      allowClear
                                      value={plan.depends_on_task_key ?? ""}
                                      onChange={(value) =>
                                        changePlan(step.task_key, plan, {
                                          depends_on_task_key: value || null,
                                        })
                                      }
                                      searchPlaceholder="Search checklist prerequisites"
                                      options={onboardingDependencyChoices(step, steps).map(
                                        (item) => ({
                                          id: item.task_key,
                                          name: item.title,
                                          label: item.title,
                                        }),
                                      )}
                                    />
                                  </div>
                                  <div className="flex items-end gap-2 pb-2">
                                    <Checkbox
                                      id={"onboarding-reminders-" + step.task_key}
                                      checked={plan.reminders_enabled}
                                      onCheckedChange={(checked) =>
                                        changePlan(step.task_key, plan, {
                                          reminders_enabled: checked === true,
                                        })
                                      }
                                    />
                                    <Label htmlFor={"onboarding-reminders-" + step.task_key}>
                                      In-app due reminders for assignee
                                    </Label>
                                  </div>
                                  <div className="sm:col-span-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={
                                        !planChanged ||
                                        planM.isPending ||
                                        updateM.isPending ||
                                        assigneesQ.isPending ||
                                        assigneesQ.isError
                                      }
                                      onClick={() =>
                                        planM.mutate({
                                          task_key: step.task_key,
                                          version: step.version,
                                          ...plan,
                                        })
                                      }
                                    >
                                      {planM.isPending
                                        ? "Saving plan…"
                                        : "Save assignment and schedule"}
                                    </Button>
                                  </div>
                                </div>
                              </details>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  size="sm"
                                  disabled={
                                    updateM.isPending ||
                                    planM.isPending ||
                                    blocked ||
                                    cannotReopen ||
                                    planChanged
                                  }
                                  title={
                                    blocked
                                      ? "Complete its prerequisite first"
                                      : cannotReopen
                                        ? "Reopen dependent steps first"
                                        : planChanged
                                          ? "Save the assignment and schedule first"
                                          : undefined
                                  }
                                  onClick={() =>
                                    updateM.mutate({
                                      task_key: step.task_key,
                                      version: step.version,
                                      complete: !completed,
                                      note,
                                    })
                                  }
                                >
                                  {completed ? "Reopen step" : "Mark complete"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={
                                    updateM.isPending ||
                                    planM.isPending ||
                                    planChanged ||
                                    note === step.note
                                  }
                                  onClick={() =>
                                    updateM.mutate({
                                      task_key: step.task_key,
                                      version: step.version,
                                      complete: completed,
                                      note,
                                    })
                                  }
                                >
                                  Save note
                                </Button>
                              </div>
                            </>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

export function FirmTeamPanel({ firmId }: { firmId: string }) {
  const load = useServerFn(listFirmTeam);
  const teamQ = useQuery({
    queryKey: ["firm-team", firmId],
    enabled: Boolean(firmId),
    queryFn: () => load({ data: { firmId } }),
  });
  if (teamQ.isPending) return <LoadingState />;
  if (teamQ.isError)
    return (
      <QueryErrorState queries={[teamQ]} title="Could not load firm team" />
    );
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Firm team</h2>
        <p className="text-sm text-muted-foreground">
          Firm membership is distinct from client access. Grant and revoke company-specific
          permissions through the existing Users & Access controls.
        </p>
      </div>
      {(teamQ.data ?? []).length === 0 ? (
        <EmptyState title="No team members" description="The firm has no visible staff records." />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="p-3 font-medium">Staff member</th>
                <th className="p-3 font-medium">Firm role</th>
                <th className="p-3 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody>
              {(teamQ.data ?? []).map((member) => (
                <tr key={member.user_id} className="border-t">
                  <td className="p-3">
                    <div className="font-medium">{member.full_name || "Team member"}</div>
                    <div className="text-xs text-muted-foreground">
                      {member.email || "Profile not shared"}
                    </div>
                  </td>
                  <td className="p-3 capitalize">{member.role}</td>
                  <td className="p-3">{new Date(member.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
