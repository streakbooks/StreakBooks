import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdvisorsSubnav } from "@/components/advisors/AdvisorsSubnav";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  listAdvisorsClients,
  listAdvisorsStaff,
  upsertAdvisorsClient,
} from "@/lib/advisors/management.functions";
import {
  createAdvisorsPortalInvite,
  unlinkAdvisorsPortalUser,
} from "@/lib/advisors/portal.functions";
import { staffLabel, type AdvisorsClientStatus } from "@/lib/advisors/management";
import { friendlyAuthError } from "@/lib/auth-helpers";

const STATUSES: Array<AdvisorsClientStatus | "all"> = [
  "all",
  "prospect",
  "active",
  "paused",
  "churned",
];

const emptyForm = {
  id: undefined as string | undefined,
  email: "",
  name: "",
  businessName: "",
  phone: "",
  status: "prospect" as AdvisorsClientStatus,
  primaryServiceCode: "" as "" | "bookkeeping" | "coaching",
  assignedAdvisorId: "",
  notes: "",
};

export function AdvisorsAdminClientsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listAdvisorsClients);
  const listStaff = useServerFn(listAdvisorsStaff);
  const upsert = useServerFn(upsertAdvisorsClient);
  const invitePortal = useServerFn(createAdvisorsPortalInvite);
  const unlinkPortal = useServerFn(unlinkAdvisorsPortalUser);
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");
  const [search, setSearch] = useState("");
  const [reason, setReason] = useState("");
  const [form, setForm] = useState(emptyForm);

  const staffQuery = useQuery({
    queryKey: ["advisors-staff"],
    queryFn: () => listStaff(),
    retry: false,
  });
  const query = useQuery({
    queryKey: ["advisors-clients", status, search],
    queryFn: () =>
      list({
        data: {
          status: status === "all" ? undefined : status,
          search: search || undefined,
        },
      }),
    retry: false,
  });

  useEffect(() => {
    if (!form.id) return;
    const match = query.data?.find((item) => item.id === form.id);
    if (!match) return;
    setForm({
      id: match.id,
      email: match.email,
      name: match.name,
      businessName: match.businessName,
      phone: match.phone ?? "",
      status: match.status,
      primaryServiceCode: (match.primaryServiceCode as "" | "bookkeeping" | "coaching") || "",
      assignedAdvisorId: match.assignedAdvisorId ?? "",
      notes: match.notes,
    });
  }, [form.id, query.data]);

  const saveM = useMutation({
    mutationFn: () =>
      upsert({
        data: {
          id: form.id,
          email: form.email,
          name: form.name,
          businessName: form.businessName,
          phone: form.phone || undefined,
          status: form.status,
          primaryServiceCode: form.primaryServiceCode || null,
          assignedAdvisorId: form.assignedAdvisorId || null,
          notes: form.notes,
          reason: reason || (form.id ? "Updated Advisors client" : "Created Advisors client"),
        },
      }),
    onSuccess: async (client) => {
      toast.success(form.id ? "Client updated" : "Client created");
      setReason("");
      setForm({ ...emptyForm, id: client.id });
      await qc.invalidateQueries({ queryKey: ["advisors-clients"] });
      await qc.invalidateQueries({ queryKey: ["advisors-overview"] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const inviteM = useMutation({
    mutationFn: () => {
      if (!form.id) throw new Error("Save the client before inviting");
      return invitePortal({
        data: {
          clientId: form.id,
          reason: reason || "Invite Advisors client to customer portal",
        },
      });
    },
    onSuccess: async (invite) => {
      toast.success(
        invite.emailed
          ? "Portal invite emailed"
          : `Portal invite created (email not sent). Link: ${invite.link ?? invite.token}`,
      );
      await qc.invalidateQueries({ queryKey: ["advisors-clients"] });
      await qc.invalidateQueries({ queryKey: ["advisors-overview"] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const unlinkM = useMutation({
    mutationFn: () => {
      if (!form.id) throw new Error("Select a client first");
      return unlinkPortal({
        data: {
          clientId: form.id,
          reason: reason || "Unlink Advisors portal login",
        },
      });
    },
    onSuccess: async () => {
      toast.success("Portal login unlinked");
      await qc.invalidateQueries({ queryKey: ["advisors-clients"] });
      await qc.invalidateQueries({ queryKey: ["advisors-overview"] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (query.isPending || staffQuery.isPending) return <LoadingState />;
  if (query.isError) {
    return (
      <main className="mx-auto max-w-6xl space-y-6 p-6">
        <ListWorkspace title="Clients" description="Advisors customer records.">
        <ErrorState
          title="Clients unavailable"
          description={friendlyAuthError(query.error)}
          onRetry={() => void query.refetch()}
        />
          </ListWorkspace>
  </main>
    );
  }

  const staff = staffQuery.data ?? [];
  const selectedLinked = Boolean(
    form.id && query.data?.find((item) => item.id === form.id)?.linkedUserId,
  );

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <ListWorkspace
        title="Clients"
        description="Manage Advisors prospects and customers, including customer portal invites."
       subnav={<AdvisorsSubnav />}>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="client-search">Search</Label>
          <Input
            id="client-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name, email or business"
            className="w-64"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="client-status-filter">Status</Label>
          <select
            id="client-status-filter"
            className="flex h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={status}
            onChange={(event) => setStatus(event.target.value as (typeof STATUSES)[number])}
          >
            {STATUSES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
        <Button type="button" variant="outline" onClick={() => setForm(emptyForm)}>
          New client
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="space-y-2">
          {query.data.length === 0 ? (
            <EmptyState
              title="No clients yet"
              description="Promote an inquiry or create a client record to begin service delivery."
            />
          ) : (
            query.data.map((client) => (
              <button
                key={client.id}
                type="button"
                onClick={() => setForm({ ...emptyForm, id: client.id })}
                className={`w-full rounded-xl border p-4 text-left transition ${
                  form.id === client.id
                    ? "border-primary bg-primary/5"
                    : "border-border/70 hover:border-primary/40"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{client.name || client.email}</p>
                    <p className="text-sm text-muted-foreground">
                      {client.email}
                      {client.businessName ? ` · ${client.businessName}` : ""}
                    </p>
                  </div>
                  <Badge variant="secondary">{client.status}</Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {client.primaryServiceCode || "no service"} ·{" "}
                  {staffLabel(staff, client.assignedAdvisorId)}
                  {client.linkedUserId ? " · portal linked" : ""}
                </p>
              </button>
            ))
          )}
        </section>

        <section className="space-y-3 rounded-xl border border-border/70 p-4">
          <h2 className="font-semibold">{form.id ? "Edit client" : "New client"}</h2>
          <div className="space-y-1">
            <Label htmlFor="client-reason">Change reason</Label>
            <Input
              id="client-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Why are you saving this client?"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="client-email">Email</Label>
              <Input
                id="client-email"
                type="email"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="client-name">Name</Label>
              <Input
                id="client-name"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="client-business">Business</Label>
              <Input
                id="client-business"
                value={form.businessName}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, businessName: event.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="client-phone">Phone</Label>
              <Input
                id="client-phone"
                value={form.phone}
                onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="client-status">Status</Label>
              <select
                id="client-status"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.status}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    status: event.target.value as AdvisorsClientStatus,
                  }))
                }
              >
                {STATUSES.filter((item) => item !== "all").map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="client-service">Primary service</Label>
              <select
                id="client-service"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.primaryServiceCode}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    primaryServiceCode: event.target.value as "" | "bookkeeping" | "coaching",
                  }))
                }
              >
                <option value="">Not set</option>
                <option value="bookkeeping">Bookkeeping</option>
                <option value="coaching">Coaching</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="client-advisor">Assigned advisor</Label>
              <select
                id="client-advisor"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.assignedAdvisorId}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, assignedAdvisorId: event.target.value }))
                }
              >
                <option value="">Unassigned</option>
                {staff.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.displayName}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="client-notes">Notes</Label>
              <Textarea
                id="client-notes"
                value={form.notes}
                onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                rows={4}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={saveM.isPending} onClick={() => saveM.mutate()}>
              {form.id ? "Save client" : "Create client"}
            </Button>
            {form.id ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={inviteM.isPending || Boolean(selectedLinked)}
                  onClick={() => inviteM.mutate()}
                >
                  Invite to portal
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={unlinkM.isPending || !selectedLinked}
                  onClick={() => unlinkM.mutate()}
                >
                  Unlink portal
                </Button>
              </>
            ) : null}
          </div>
          {selectedLinked ? (
            <p className="text-xs text-muted-foreground">Portal login is linked for this client.</p>
          ) : form.id ? (
            <p className="text-xs text-muted-foreground">
              Portal invite emails the client a link to `/advisors/portal/invite/…` (sign-in
              required).
            </p>
          ) : null}
        </section>
      </div>
        </ListWorkspace>
  </main>
  );
}
