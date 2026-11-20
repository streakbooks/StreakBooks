import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { getFirmClientName, type FirmClientRow } from "@/lib/firm/client-portfolio";
import {
  listFirmClientRequests,
  saveFirmClientRequest,
  summarizeRequests,
  REQUEST_PRIORITIES,
  REQUEST_STATUSES,
  type FirmClientRequest,
  type FirmClientRequestInput,
} from "@/lib/firm/firm-requests.functions";
import { listFirmTeam } from "@/lib/firm/firm-workflows.functions";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { LoadingState, EmptyState } from "@/components/common/states";
import { LookupSelect } from "@/components/lookup";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Draft = Pick<
  FirmClientRequestInput,
  "title" | "description" | "status" | "priority" | "due_date" | "assigned_to" | "last_note"
>;
const emptyDraft: Draft = {
  title: "",
  description: "",
  status: "open",
  priority: "normal",
  due_date: null,
  assigned_to: null,
  last_note: "",
};

export function FirmClientRequestsPanel({
  firmId,
  clients,
  canManage,
}: {
  firmId: string;
  clients: FirmClientRow[];
  canManage: boolean;
}) {
  const available = useMemo(() => clients.filter((client) => Boolean(client.companies)), [clients]);
  const [selected, setSelected] = useState("");
  const clientId = available.some((client) => client.company_id === selected)
    ? selected
    : available[0]?.company_id || "";
  const [editing, setEditing] = useState<FirmClientRequest | null>(null);
  const [dialog, setDialog] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [filter, setFilter] = useState("all");
  const load = useServerFn(listFirmClientRequests);
  const save = useServerFn(saveFirmClientRequest);
  const team = useServerFn(listFirmTeam);
  const qc = useQueryClient();
  const queryKey = ["firm-client-requests", firmId, clientId];
  const requestsQ = useQuery({
    queryKey,
    enabled: Boolean(clientId),
    queryFn: () => load({ data: { firmId, companyId: clientId } }),
  });
  const teamQ = useQuery({
    queryKey: ["firm-team", firmId],
    enabled: Boolean(firmId && canManage),
    queryFn: () => team({ data: { firmId } }),
  });
  const saveM = useMutation({
    mutationFn: () =>
      save({
        data: {
          ...draft,
          firmId,
          companyId: clientId,
          ...(editing ? { id: editing.id, version: editing.version } : {}),
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey });
      setDialog(false);
      setEditing(null);
      toast.success("Client request saved");
    },
    onError: async (error) => {
      await qc.invalidateQueries({ queryKey });
      toast.error(friendlyAuthError(error));
    },
  });

  function beginEdit(value?: FirmClientRequest) {
    setEditing(value ?? null);
    setDraft(
      value
        ? {
            title: value.title,
            description: value.description,
            status: value.status,
            priority: value.priority,
            due_date: value.due_date,
            assigned_to: value.assigned_to,
            last_note: value.last_note,
          }
        : { ...emptyDraft },
    );
    setDialog(true);
  }

  const all = requestsQ.data ?? [];
  const visible = all.filter((request) => filter === "all" || request.status === filter);
  const metrics = summarizeRequests(all, new Date().toISOString().slice(0, 10));
  const display = (value: string) => value.replace("_", " ");

  return (
    <section className="space-y-5" aria-label="Client requests">
      <div>
        <h2 className="text-lg font-semibold">Client information requests</h2>
        <p className="text-sm text-muted-foreground">
          Track information and document requests internally with ownership, deadlines and review
          status. Saving a request does not send email or grant portal access.
        </p>
        <Link to="/files" className="text-sm underline">
          Open existing Documents workspace
        </Link>
      </div>
      {!available.length ? (
        <EmptyState
          title="No linked clients"
          description="Link an authorised client organisation to manage its information requests."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="w-full max-w-md space-y-1">
              <Label>Client organisation</Label>
              <LookupSelect
                ariaLabel="Request client"
                allowClear={false}
                value={clientId}
                onChange={setSelected}
                searchPlaceholder="Search client"
                options={available.map((client) => ({
                  id: client.company_id,
                  name: getFirmClientName(client),
                  label: getFirmClientName(client),
                }))}
              />
            </div>
            {canManage ? (
              <Button size="sm" onClick={() => beginEdit()}>
                New request
              </Button>
            ) : null}
          </div>
          {requestsQ.isPending ? (
            <LoadingState />
          ) : requestsQ.isError ? (
            <QueryErrorState queries={[requestsQ]} title="Could not load requests" />
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-4">
                {(
                  [
                    ["All requests", metrics.total],
                    ["Outstanding", metrics.unresolved],
                    ["Received", metrics.received],
                    ["Overdue", metrics.overdue],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="rounded-lg border bg-card p-4">
                    <p className="text-sm text-muted-foreground">{label}</p>
                    <p className="text-2xl font-semibold tabular-nums">{value}</p>
                  </div>
                ))}
              </div>
              <div className="max-w-xs space-y-1">
                <Label>Filter requests</Label>
                <RecordLookupSelect value={filter} onValueChange={setFilter}>
                  <SelectTrigger aria-label="Request status filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {REQUEST_STATUSES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {display(value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </RecordLookupSelect>
              </div>
              {visible.length === 0 ? (
                <EmptyState
                  title="No matching requests"
                  description="Create a request or change the status filter."
                />
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-left">
                      <tr>
                        <th className="p-3 font-medium">Request</th>
                        <th className="p-3 font-medium">Status</th>
                        <th className="p-3 font-medium">Priority</th>
                        <th className="p-3 font-medium">Due</th>
                        <th className="p-3 font-medium">Assigned</th>
                        <th className="p-3 font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((request) => (
                        <tr key={request.id} className="border-t">
                          <td className="p-3">
                            <div className="font-medium">{request.title}</div>
                            {request.description ? (
                              <p className="max-w-64 truncate text-xs text-muted-foreground">
                                {request.description}
                              </p>
                            ) : null}
                          </td>
                          <td className="p-3">
                            <Badge variant="secondary" className="capitalize">
                              {display(request.status)}
                            </Badge>
                          </td>
                          <td className="p-3 capitalize">{request.priority}</td>
                          <td className="p-3 whitespace-nowrap">{request.due_date || "—"}</td>
                          <td className="p-3">
                            {teamQ.data?.find((member) => member.user_id === request.assigned_to)
                              ?.full_name || (request.assigned_to ? "Firm member" : "Unassigned")}
                          </td>
                          <td className="p-3">
                            {canManage ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => beginEdit(request)}
                              >
                                Edit
                              </Button>
                            ) : (
                              <span className="text-muted-foreground">View only</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}
      <Dialog
        open={dialog}
        onOpenChange={(open) => {
          if (!saveM.isPending) setDialog(open);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit request" : "New client request"}</DialogTitle>
            <DialogDescription>
              Internal tracking only. Document uploads and external delivery remain in their
              existing authorised workflows.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!teamQ.isSuccess || teamQ.isError || saveM.isPending) return;
              saveM.mutate();
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="request-title">Request title</Label>
              <Input
                id="request-title"
                required
                minLength={3}
                maxLength={180}
                value={draft.title}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, title: event.target.value }))
                }
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Status</Label>
                <RecordLookupSelect
                  value={draft.status}
                  onValueChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      status: value as Draft["status"],
                    }))
                  }
                >
                  <SelectTrigger aria-label="Request status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REQUEST_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {display(status)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </RecordLookupSelect>
              </div>
              <div className="space-y-1">
                <Label>Priority</Label>
                <RecordLookupSelect
                  value={draft.priority}
                  onValueChange={(value) =>
                    setDraft((current) => ({
                      ...current,
                      priority: value as Draft["priority"],
                    }))
                  }
                >
                  <SelectTrigger aria-label="Request priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REQUEST_PRIORITIES.map((priority) => (
                      <SelectItem key={priority} value={priority}>
                        {priority}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </RecordLookupSelect>
              </div>
              <div className="space-y-1">
                <Label htmlFor="request-due">Due date</Label>
                <Input
                  id="request-due"
                  type="date"
                  value={draft.due_date ?? ""}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      due_date: event.target.value || null,
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Responsible team member</Label>
                {teamQ.isError ? (
                  <QueryErrorState queries={[teamQ]} title="Could not load firm team" />
                ) : teamQ.isSuccess ? (
                  <RecordLookupSelect
                    value={draft.assigned_to ?? "unassigned"}
                    onValueChange={(value) =>
                      setDraft((current) => ({
                        ...current,
                        assigned_to: value === "unassigned" ? null : value,
                      }))
                    }
                    disabled={teamQ.isPending}
                  >
                    <SelectTrigger aria-label="Assign firm member">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {(teamQ.data ?? []).map((member) => (
                        <SelectItem key={member.user_id} value={member.user_id}>
                          {member.full_name || member.email || "Firm member"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </RecordLookupSelect>
                ) : null}
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="request-description">Requested information</Label>
              <textarea
                id="request-description"
                className="min-h-20 w-full rounded-md border bg-background p-3 text-sm"
                maxLength={3000}
                value={draft.description}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, description: event.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="request-note">Latest internal note</Label>
              <textarea
                id="request-note"
                className="min-h-16 w-full rounded-md border bg-background p-3 text-sm"
                maxLength={1500}
                value={draft.last_note}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, last_note: event.target.value }))
                }
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={saveM.isPending}
                onClick={() => setDialog(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saveM.isPending || !teamQ.isSuccess || teamQ.isError}>
                {saveM.isPending ? "Saving…" : "Save request"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
