import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { getFirmClientName, type FirmClientRow } from "@/lib/firm/client-portfolio";
import {
  RESPONSIBILITIES,
  addExistingFirmColleague,
  listAssignableFirmMembers,
  listCandidateFirmColleagues,
  listFirmClientAssignments,
  removeFirmAssignment,
  saveFirmAssignment,
} from "@/lib/firm/firm-assignments.functions";
import { LookupSelect } from "@/components/lookup";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ErrorState, LoadingState, EmptyState } from "@/components/common/states";

export function FirmStaffAssignments({
  firmId,
  clients,
  canManage,
}: {
  firmId: string;
  clients: FirmClientRow[];
  canManage: boolean;
}) {
  const accessible = useMemo(() => clients.filter((c) => Boolean(c.companies)), [clients]);
  const [selection, setSelection] = useState("");
  const companyId = accessible.some((c) => c.company_id === selection)
    ? selection
    : (accessible[0]?.company_id ?? "");
  const [assignee, setAssignee] = useState("");
  const [responsibility, setResponsibility] =
    useState<(typeof RESPONSIBILITIES)[number]>("bookkeeper");
  const [candidate, setCandidate] = useState("");
  const loadMembers = useServerFn(listAssignableFirmMembers);
  const loadAssignments = useServerFn(listFirmClientAssignments);
  const loadCandidates = useServerFn(listCandidateFirmColleagues);
  const assign = useServerFn(saveFirmAssignment);
  const remove = useServerFn(removeFirmAssignment);
  const addColleague = useServerFn(addExistingFirmColleague);
  const qc = useQueryClient();
  const membersQ = useQuery({
    queryKey: ["firm-assignable", firmId, companyId],
    enabled: Boolean(companyId),
    queryFn: () => loadMembers({ data: { firmId, companyId } }),
  });
  const assignmentsQ = useQuery({
    queryKey: ["firm-assignments", firmId, companyId],
    enabled: Boolean(companyId),
    queryFn: () => loadAssignments({ data: { firmId, companyId } }),
  });
  const candidatesQ = useQuery({
    queryKey: ["firm-candidates", firmId, companyId],
    enabled: Boolean(companyId && canManage),
    queryFn: () => loadCandidates({ data: { firmId, companyId } }),
  });
  const available = membersQ.data ?? [];
  const selectedUser = available.some((m) => m.user_id === assignee)
    ? assignee
    : (available[0]?.user_id ?? "");
  const candidates = candidatesQ.data ?? [];
  const selectedCandidate = candidates.some((m) => m.user_id === candidate)
    ? candidate
    : (candidates[0]?.user_id ?? "");
  const mutation = useMutation({
    mutationFn: () => assign({ data: { firmId, companyId, userId: selectedUser, responsibility } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["firm-assignments", firmId, companyId] });
      toast.success("Client responsibility saved");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  const removeM = useMutation({
    mutationFn: (userId: string) => remove({ data: { firmId, companyId, userId } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["firm-assignments", firmId, companyId] });
      toast.success("Client responsibility removed");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  const addM = useMutation({
    mutationFn: () => addColleague({ data: { firmId, companyId, userId: selectedCandidate } }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["firm-assignable", firmId, companyId] }),
        qc.invalidateQueries({ queryKey: ["firm-candidates", firmId, companyId] }),
        qc.invalidateQueries({ queryKey: ["firm-team", firmId] }),
      ]);
      setCandidate("");
      toast.success("Existing colleague added to firm; company access unchanged");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  const names = new Map(available.map((m) => [m.user_id, m.full_name || m.email || "Team member"]));
  return (
    <section className="space-y-5" aria-label="Client staff assignments">
      <div>
        <h2 className="text-lg font-semibold">Client responsibilities</h2>
        <p className="text-sm text-muted-foreground">
          Assign existing authorised colleagues. Assignments do not grant accounting permissions or
          send invitations. Use the existing Users &amp; Access workspace for external invitations.
        </p>
        <Link
          to="/settings"
          search={{ section: "users", settingsPanel: "category:users" }}
          className="text-sm underline"
        >
          Open Users &amp; Access invitations
        </Link>
      </div>
      {!companyId ? (
        <EmptyState title="No linked clients" description="Link a client to manage its team." />
      ) : (
        <>
          <div className="max-w-md space-y-1">
            <Label>Client organisation</Label>
            <LookupSelect
              ariaLabel="Choose staff assignment client"
              allowClear={false}
              value={companyId}
              onChange={(id) => {
                setSelection(id);
                setAssignee("");
                setCandidate("");
              }}
              searchPlaceholder="Search clients"
              options={accessible.map((c) => ({
                id: c.company_id,
                name: getFirmClientName(c),
                label: getFirmClientName(c),
              }))}
            />
          </div>
          {assignmentsQ.isPending || membersQ.isPending ? (
            <LoadingState />
          ) : assignmentsQ.isError || membersQ.isError ? (
            <ErrorState
              title="Could not load staff assignments"
              description={friendlyAuthError(assignmentsQ.error ?? membersQ.error)}
            />
          ) : (
            <div className="space-y-3">
              {(assignmentsQ.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No staff responsibilities assigned.</p>
              ) : (
                (assignmentsQ.data ?? []).map((item) => (
                  <div
                    key={item.user_id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <div>
                      <p className="font-medium">{names.get(item.user_id) ?? "Team member"}</p>
                      <p className="text-sm capitalize text-muted-foreground">
                        {item.responsibility}
                      </p>
                    </div>
                    {canManage ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={removeM.isPending}
                        onClick={() => {
                          if (window.confirm("Remove this client responsibility?"))
                            removeM.mutate(item.user_id);
                        }}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                ))
              )}
              {canManage && available.length ? (
                <div className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_200px_auto] sm:items-end">
                  <div className="space-y-1">
                    <Label>Colleague</Label>
                    <RecordLookupSelect required value={selectedUser} onValueChange={setAssignee}>
                      <SelectTrigger aria-label="Assign colleague">
                        <SelectValue placeholder="Choose colleague" />
                      </SelectTrigger>
                      <SelectContent>
                        {available.map((m) => (
                          <SelectItem key={m.user_id} value={m.user_id}>
                            {m.full_name || m.email || "Team member"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </RecordLookupSelect>
                  </div>
                  <div className="space-y-1">
                    <Label>Responsibility</Label>
                    <Select
                      value={responsibility}
                      onValueChange={(v) => setResponsibility(v as typeof responsibility)}
                    >
                      {/* lookup-fixed-enum: Responsibility uses fixed practice roles, not staff records. */}
                      <SelectTrigger aria-label="Responsibility">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RESPONSIBILITIES.map((role) => (
                          <SelectItem key={role} value={role} className="capitalize">
                            {role}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    disabled={!selectedUser || mutation.isPending}
                    onClick={() => mutation.mutate()}
                  >
                    Save assignment
                  </Button>
                </div>
              ) : null}
            </div>
          )}
          {canManage ? (
            <div className="space-y-3 rounded-lg border bg-card p-4">
              <div>
                <h3 className="font-semibold">Add an existing company colleague to the firm</h3>
                <p className="text-sm text-muted-foreground">
                  Only already-active company users can be added. This never grants additional
                  company access.
                </p>
              </div>
              {candidatesQ.isPending ? (
                <LoadingState rows={2} />
              ) : candidatesQ.isError ? (
                <ErrorState
                  onRetry={() => void candidatesQ.refetch()}
                  title="Could not load eligible colleagues"
                  description={friendlyAuthError(candidatesQ.error)}
                />
              ) : candidates.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No eligible unlinked colleagues in this company.
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-56 flex-1">
                    <RecordLookupSelect
                      required
                      value={selectedCandidate}
                      onValueChange={setCandidate}
                    >
                      <SelectTrigger aria-label="Existing company colleague">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {candidates.map((m) => (
                          <SelectItem key={m.user_id} value={m.user_id}>
                            {m.full_name || m.email || "Existing company user"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </RecordLookupSelect>
                  </div>
                  <Button
                    disabled={!selectedCandidate || addM.isPending}
                    onClick={() => addM.mutate()}
                  >
                    Add colleague
                  </Button>
                </div>
              )}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
