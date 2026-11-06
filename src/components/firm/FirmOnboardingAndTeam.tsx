import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { LookupSelect } from "@/components/lookup";
import { ErrorState, LoadingState, EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  ONBOARDING_TEMPLATE,
  OFFBOARDING_TEMPLATE,
  initializeFirmOffboarding,
  initializeFirmOnboarding,
  listFirmOnboardingSteps,
  listFirmTeam,
  updateFirmOnboardingStep,
} from "@/lib/firm/firm-workflows.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { getFirmClientName, type FirmClientRow } from "@/lib/firm/client-portfolio";
import { FirmCustomOnboardingTemplates } from "@/components/firm/FirmCustomOnboardingTemplates";

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
  const list = useServerFn(listFirmOnboardingSteps);
  const initialize = useServerFn(initializeFirmOnboarding);
  const initializeOffboarding = useServerFn(initializeFirmOffboarding);
  const update = useServerFn(updateFirmOnboardingStep);
  const qc = useQueryClient();
  const queryKey = ["firm-onboarding-steps", firmId, clientId];
  const stepsQ = useQuery({
    queryKey,
    enabled: Boolean(clientId),
    queryFn: () => list({ data: { firmId, companyId: clientId } }),
  });
  const createM = useMutation({
    mutationFn: () => initialize({ data: { firmId, companyId: clientId } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey });
      toast.success("Standard onboarding checklist added");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const offboardM = useMutation({
    mutationFn: () => initializeOffboarding({ data: { firmId, companyId: clientId } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey });
      toast.success("Offboarding checklist added without revoking client access");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const updateM = useMutation({
    mutationFn: (data: { task_key: string; version: number; complete: boolean; note: string }) =>
      update({ data: { ...data, firmId, companyId: clientId } }),
    onSuccess: async () => {
      setNotes({});
      await qc.invalidateQueries({ queryKey });
      toast.success("Checklist updated");
    },
    onError: async (error) => {
      await qc.invalidateQueries({ queryKey });
      toast.error(friendlyAuthError(error));
    },
  });
  const steps = stepsQ.data ?? [];
  const done = steps.filter((step) => step.completed_at !== null).length;

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
            }}
          />
          <FirmCustomOnboardingTemplates
            firmId={firmId}
            companyId={clientId}
            canManage={canManage}
          />
          {stepsQ.isPending ? (
            <LoadingState />
          ) : stepsQ.isError ? (
            <ErrorState
              onRetry={() => void stepsQ.refetch()}
              title="Could not load onboarding"
              description={friendlyAuthError(stepsQ.error)}
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
                <div>
                  <p className="font-semibold">
                    {done} of {steps.length} checklist items completed
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {steps.length === 0
                      ? "No checklist created for this client yet."
                      : "Checklists are operational evidence, not automatic accounting approval."}
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
                    return (
                      <div key={step.task_key} className="rounded-lg border bg-card p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="font-medium">{step.title}</div>
                          <Badge variant={completed ? "secondary" : "outline"}>
                            {completed ? "Complete" : "Pending"}
                          </Badge>
                        </div>
                        {completed && step.completed_at ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Completed {new Date(step.completed_at).toLocaleString()}
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
                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                disabled={updateM.isPending}
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
                                disabled={updateM.isPending || note === step.note}
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
      <ErrorState
        onRetry={() => void teamQ.refetch()}
        title="Could not load firm team"
        description={friendlyAuthError(teamQ.error)}
      />
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
