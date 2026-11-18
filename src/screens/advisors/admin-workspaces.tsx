import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdvisorsSubnav } from "@/components/advisors/AdvisorsSubnav";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  addAdvisorsWorkspaceNote,
  getAdvisorsWorkspace,
  listAdvisorsDeliveryCandidates,
  listAdvisorsWorkspaces,
  openAdvisorsWorkPeriod,
  setAdvisorsDeliveryTask,
  upsertAdvisorsDocumentRequest,
  upsertAdvisorsWorkspace,
} from "@/lib/advisors/workspaces.functions";
import type { AdvisorsDeliveryTaskStatus } from "@/lib/advisors/workspaces";
import { friendlyAuthError } from "@/lib/auth-helpers";

export function AdvisorsAdminWorkspacesPage() {
  const qc = useQueryClient();
  const list = useServerFn(listAdvisorsWorkspaces);
  const candidates = useServerFn(listAdvisorsDeliveryCandidates);
  const upsert = useServerFn(upsertAdvisorsWorkspace);
  const loadDetail = useServerFn(getAdvisorsWorkspace);
  const openPeriod = useServerFn(openAdvisorsWorkPeriod);
  const setTask = useServerFn(setAdvisorsDeliveryTask);
  const upsertDoc = useServerFn(upsertAdvisorsDocumentRequest);
  const addNote = useServerFn(addAdvisorsWorkspaceNote);

  const [reason, setReason] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [periodLabel, setPeriodLabel] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);

  const listQ = useQuery({
    queryKey: ["advisors-workspaces"],
    queryFn: () => list({ data: {} }),
    retry: false,
  });
  const candidatesQ = useQuery({
    queryKey: ["advisors-delivery-candidates"],
    queryFn: () => candidates(),
    retry: false,
  });
  const detailQ = useQuery({
    queryKey: ["advisors-workspace", selectedId],
    enabled: Boolean(selectedId),
    queryFn: () => loadDetail({ data: { workspaceId: selectedId! } }),
    retry: false,
  });

  const detail = detailQ.data;
  const periodTasks = useMemo(() => {
    if (!detail) return [];
    const periodId = selectedPeriodId || detail.periods[0]?.id;
    return detail.tasks.filter((task) => task.periodId === periodId);
  }, [detail, selectedPeriodId]);

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ["advisors-workspaces"] });
    await qc.invalidateQueries({ queryKey: ["advisors-delivery-candidates"] });
    await qc.invalidateQueries({ queryKey: ["advisors-workspace", selectedId] });
    await qc.invalidateQueries({ queryKey: ["advisors-overview"] });
    await qc.invalidateQueries({ queryKey: ["advisors-documents"] });
  };

  const createM = useMutation({
    mutationFn: (engagementId: string) =>
      upsert({
        data: {
          engagementId,
          reason: reason || "Opened Advisors delivery workspace",
        },
      }),
    onSuccess: async (workspace) => {
      toast.success("Workspace opened");
      setReason("");
      setSelectedId(workspace.id);
      await invalidate();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const periodM = useMutation({
    mutationFn: () => {
      if (!selectedId) throw new Error("Select a workspace");
      const isCoaching = detail?.kind === "coaching";
      const now = new Date();
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const monthEndDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const monthEnd = `${monthEndDate.getFullYear()}-${String(monthEndDate.getMonth() + 1).padStart(2, "0")}-${String(monthEndDate.getDate()).padStart(2, "0")}`;
      return openPeriod({
        data: {
          workspaceId: selectedId,
          label: periodLabel || undefined,
          periodStart: isCoaching ? undefined : monthStart,
          periodEnd: isCoaching ? undefined : monthEnd,
          sessionAt: isCoaching ? now.toISOString() : undefined,
          reason: reason || "Opened Advisors work period",
        },
      });
    },
    onSuccess: async (workspace) => {
      toast.success("Period opened with seeded tasks");
      setReason("");
      setPeriodLabel("");
      setSelectedPeriodId(workspace.periods[0]?.id ?? null);
      await invalidate();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const taskM = useMutation({
    mutationFn: (input: { taskId: string; status: AdvisorsDeliveryTaskStatus }) =>
      setTask({
        data: {
          taskId: input.taskId,
          status: input.status,
          reason: reason || `Marked delivery task ${input.status}`,
        },
      }),
    onSuccess: async () => {
      toast.success("Delivery task updated");
      setReason("");
      await invalidate();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const docM = useMutation({
    mutationFn: (input: { id: string; status: "received" | "reviewed" | "cancelled" }) =>
      upsertDoc({
        data: {
          id: input.id,
          status: input.status,
          reason: reason || `Updated document request to ${input.status}`,
        },
      }),
    onSuccess: async () => {
      toast.success("Document request updated");
      setReason("");
      await invalidate();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const noteM = useMutation({
    mutationFn: () => {
      if (!selectedId) throw new Error("Select a workspace");
      return addNote({
        data: {
          workspaceId: selectedId,
          periodId: selectedPeriodId || undefined,
          body: noteBody,
          reason: reason || "Added Advisors workspace note",
        },
      });
    },
    onSuccess: async () => {
      toast.success("Note added");
      setNoteBody("");
      setReason("");
      await invalidate();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (listQ.isPending || candidatesQ.isPending)
    return (
      <main className="mx-auto max-w-6xl space-y-6 p-6">
        <ListWorkspace title="Workspaces" description="Advisors delivery workspaces.">
          <AdvisorsSubnav />
          <div role="status" aria-live="polite">
            <LoadingState />
          </div>
        </ListWorkspace>
      </main>
    );
  if (listQ.isError || candidatesQ.isError) {
    return (
      <main className="mx-auto max-w-6xl space-y-6 p-6">
        <ListWorkspace title="Workspaces" description="Advisors delivery workspaces.">
          <AdvisorsSubnav />
          <div role="alert">
            <ErrorState
              title="Workspaces unavailable"
              description={friendlyAuthError(listQ.error ?? candidatesQ.error)}
              onRetry={() => {
                void listQ.refetch();
                void candidatesQ.refetch();
              }}
            />
          </div>
        </ListWorkspace>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <ListWorkspace
        title="Workspaces"
        description="Bookkeeping months and coaching sessions with delivery tasks, document requests and advisor notes. No ledger posting."
      >
        <AdvisorsSubnav />
        <p role="status" aria-live="polite" className="sr-only">
          {listQ.data.length} delivery workspaces found
        </p>

        <div className="space-y-1">
          <Label htmlFor="workspace-reason">Change reason</Label>
          <Input
            id="workspace-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why are you changing delivery work?"
            maxLength={5000}
            className="max-w-xl"
          />
        </div>

        {(candidatesQ.data?.length ?? 0) > 0 ? (
          <section className="space-y-2 rounded-xl border border-border/70 p-4">
            <h2 className="font-semibold">Open workspace from engagement</h2>
            <div className="flex flex-wrap gap-2">
              {candidatesQ.data?.map((candidate) => (
                <Button
                  key={candidate.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={
                    createM.isPending ||
                    periodM.isPending ||
                    taskM.isPending ||
                    docM.isPending ||
                    noteM.isPending
                  }
                  onClick={() => createM.mutate(candidate.id)}
                >
                  {candidate.title} ({candidate.serviceCode})
                </Button>
              ))}
            </div>
          </section>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <section className="space-y-2">
            {listQ.data.length === 0 ? (
              <EmptyState
                title="No delivery workspaces"
                description="Activate an engagement, then open a bookkeeping or coaching workspace."
              />
            ) : (
              listQ.data.map((workspace) => (
                <button
                  key={workspace.id}
                  type="button"
                  aria-pressed={selectedId === workspace.id}
                  onClick={() => {
                    setSelectedId(workspace.id);
                    setSelectedPeriodId(null);
                  }}
                  className={`w-full rounded-xl border p-4 text-left transition ${
                    selectedId === workspace.id
                      ? "border-primary bg-primary/5"
                      : "border-border/70 hover:border-primary/40"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{workspace.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {workspace.clientName || workspace.clientEmail}
                      </p>
                    </div>
                    <Badge variant="secondary">{workspace.kind}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {workspace.openPeriods ?? 0} open periods · {workspace.openTasks ?? 0} tasks ·{" "}
                    {workspace.openDocuments ?? 0} docs
                  </p>
                </button>
              ))
            )}
          </section>

          <section className="space-y-4 rounded-xl border border-border/70 p-4">
            {!selectedId ? (
              <EmptyState
                title="Select a workspace"
                description="Open a period to seed bookkeeping or coaching delivery tasks."
              />
            ) : detailQ.isPending ? (
              <LoadingState />
            ) : detailQ.isError ? (
              <ErrorState
                title="Workspace detail unavailable"
                description={friendlyAuthError(detailQ.error)}
                onRetry={() => void detailQ.refetch()}
              />
            ) : detail ? (
              <>
                <div>
                  <h2 className="font-semibold">{detail.title}</h2>
                  <p className="text-sm text-muted-foreground">
                    {detail.kind} · {detail.clientEmail} · {detail.engagementStatus}
                  </p>
                </div>

                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="period-label">New period label</Label>
                    <Input
                      id="period-label"
                      value={periodLabel}
                      onChange={(event) => setPeriodLabel(event.target.value)}
                      placeholder={detail.kind === "coaching" ? "Session title" : "Nov 2026"}
                    />
                  </div>
                  <Button
                    type="button"
                    disabled={
                      createM.isPending ||
                      periodM.isPending ||
                      taskM.isPending ||
                      docM.isPending ||
                      noteM.isPending
                    }
                    onClick={() => periodM.mutate()}
                  >
                    Open period
                  </Button>
                </div>

                {detail.periods.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {detail.periods.map((period) => (
                      <Button
                        key={period.id}
                        type="button"
                        size="sm"
                        variant={
                          (selectedPeriodId || detail.periods[0]?.id) === period.id
                            ? "default"
                            : "outline"
                        }
                        aria-pressed={(selectedPeriodId || detail.periods[0]?.id) === period.id}
                        onClick={() => setSelectedPeriodId(period.id)}
                      >
                        {period.label} ({period.status})
                      </Button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No periods yet.</p>
                )}

                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Delivery tasks</h3>
                  {periodTasks.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Open a period to seed tasks.</p>
                  ) : (
                    periodTasks.map((task) => (
                      <article key={task.id} className="rounded-lg border border-border/50 p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">{task.title}</p>
                            <p className="text-sm text-muted-foreground">{task.description}</p>
                          </div>
                          <Badge variant="outline">{task.status}</Badge>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {(["in_progress", "blocked", "done", "skipped"] as const).map((next) => (
                            <Button
                              key={next}
                              type="button"
                              size="sm"
                              variant={task.status === next ? "default" : "outline"}
                              disabled={
                                task.status === next ||
                                createM.isPending ||
                                periodM.isPending ||
                                taskM.isPending ||
                                docM.isPending ||
                                noteM.isPending
                              }
                              onClick={() => taskM.mutate({ taskId: task.id, status: next })}
                            >
                              {next}
                            </Button>
                          ))}
                        </div>
                      </article>
                    ))
                  )}
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Document requests</h3>
                  {detail.documentRequests.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No document requests.</p>
                  ) : (
                    detail.documentRequests.map((request) => (
                      <article
                        key={request.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/50 p-3 text-sm"
                      >
                        <div>
                          <p className="font-medium">{request.title}</p>
                          <p className="text-muted-foreground">{request.instructions}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline">{request.status}</Badge>
                          {request.status === "requested" ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={
                                createM.isPending ||
                                periodM.isPending ||
                                taskM.isPending ||
                                docM.isPending ||
                                noteM.isPending
                              }
                              onClick={() => docM.mutate({ id: request.id, status: "received" })}
                            >
                              Mark received
                            </Button>
                          ) : null}
                          {request.status === "received" ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={docM.isPending}
                              onClick={() => docM.mutate({ id: request.id, status: "reviewed" })}
                            >
                              Mark reviewed
                            </Button>
                          ) : null}
                        </div>
                      </article>
                    ))
                  )}
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Advisor notes</h3>
                  <Textarea
                    aria-label="Internal delivery note"
                    maxLength={5000}
                    value={noteBody}
                    onChange={(event) => setNoteBody(event.target.value)}
                    placeholder="Internal delivery note"
                    rows={3}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      createM.isPending ||
                      periodM.isPending ||
                      taskM.isPending ||
                      docM.isPending ||
                      noteM.isPending ||
                      !noteBody.trim()
                    }
                    onClick={() => noteM.mutate()}
                  >
                    Add note
                  </Button>
                  <ul className="space-y-2">
                    {detail.notes.map((note) => (
                      <li key={note.id} className="rounded-lg border border-border/50 p-3 text-sm">
                        <p className="text-xs text-muted-foreground">
                          {note.visibility} · {new Date(note.createdAt).toLocaleString()}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap">{note.body}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            ) : null}
          </section>
        </div>
      </ListWorkspace>
    </main>
  );
}
