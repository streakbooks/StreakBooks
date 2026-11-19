import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdvisorsSubnav } from "@/components/advisors/AdvisorsSubnav";
import { EmptyState, LoadingState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  listAdvisorsInquiries,
  listAdvisorsStaff,
  promoteAdvisorsInquiry,
  updateAdvisorsInquiry,
} from "@/lib/advisors/management.functions";
import { staffLabel, type AdvisorsInquiryStatus } from "@/lib/advisors/management";
import { friendlyAuthError } from "@/lib/auth-helpers";

const STATUSES: Array<AdvisorsInquiryStatus | "all"> = [
  "all",
  "new",
  "contacted",
  "qualified",
  "closed",
];

export function AdvisorsAdminInquiriesPage() {
  const qc = useQueryClient();
  const list = useServerFn(listAdvisorsInquiries);
  const listStaff = useServerFn(listAdvisorsStaff);
  const update = useServerFn(updateAdvisorsInquiry);
  const promote = useServerFn(promoteAdvisorsInquiry);
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");
  const [search, setSearch] = useState("");
  const [reason, setReason] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState("");

  const staffQuery = useQuery({
    queryKey: ["advisors-staff"],
    queryFn: () => listStaff(),
    retry: false,
  });
  const query = useQuery({
    queryKey: ["advisors-inquiries", status, search],
    queryFn: () =>
      list({
        data: {
          status: status === "all" ? undefined : status,
          search: search || undefined,
        },
      }),
    retry: false,
  });

  const selected = useMemo(
    () => query.data?.find((item) => item.id === selectedId) ?? null,
    [query.data, selectedId],
  );

  const updateM = useMutation({
    mutationFn: (input: {
      inquiryId: string;
      status?: AdvisorsInquiryStatus;
      assignedAdvisorId?: string | null;
      adminNotes?: string;
    }) =>
      update({
        data: {
          ...input,
          reason: reason || "Updated inquiry from Advisors console",
        },
      }),
    onSuccess: async () => {
      toast.success("Inquiry updated");
      setReason("");
      await qc.invalidateQueries({ queryKey: ["advisors-inquiries"] });
      await qc.invalidateQueries({ queryKey: ["advisors-overview"] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const promoteM = useMutation({
    mutationFn: (inquiryId: string) =>
      promote({
        data: {
          inquiryId,
          reason: reason || "Promoted inquiry to Advisors client",
        },
      }),
    onSuccess: async () => {
      toast.success("Client created from inquiry");
      setReason("");
      await qc.invalidateQueries({ queryKey: ["advisors-inquiries"] });
      await qc.invalidateQueries({ queryKey: ["advisors-clients"] });
      await qc.invalidateQueries({ queryKey: ["advisors-overview"] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (query.isPending || staffQuery.isPending)
    return (
      <main className="mx-auto max-w-6xl space-y-6 p-6">
        <ListWorkspace title="Inquiries" description="Loading Advisors inquiries and staff.">
          <AdvisorsSubnav />
          <div role="status" aria-live="polite">
            <LoadingState />
          </div>
        </ListWorkspace>
      </main>
    );
  if (query.isError || staffQuery.isError) {
    return (
      <main className="mx-auto max-w-6xl space-y-6 p-6">
        <ListWorkspace
          title="Inquiries"
          description="Leads captured from Advisors chat and handoffs."
        >
          <AdvisorsSubnav />
          <div role="alert">
            <QueryErrorState queries={[query, staffQuery]} title="Inquiries unavailable" />
          </div>
        </ListWorkspace>
      </main>
    );
  }

  const staff = staffQuery.data ?? [];

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <ListWorkspace
        title="Inquiries"
        description="Search, assign and progress Advisors leads. Promote qualified leads into clients."
      >
        <AdvisorsSubnav />
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          {query.data.length} inquiries found
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="inquiry-search">Search</Label>
            <Input
              id="inquiry-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, email or business"
              className="w-64"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="inquiry-status">Status</Label>
            <RecordLookupSelect
              id="inquiry-status"
              className="flex h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={status}
              onValueChange={(event) => setStatus(event as (typeof STATUSES)[number])}
            >
              {STATUSES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </RecordLookupSelect>
          </div>
          <div className="min-w-[16rem] flex-1 space-y-1">
            <Label htmlFor="inquiry-reason">Change reason</Label>
            <Input
              id="inquiry-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Why are you updating this inquiry?"
            />
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="space-y-2">
            {query.data.length === 0 ? (
              <EmptyState
                title="No inquiries match"
                description="Try clearing filters, or capture a lead from the public Advisors chat."
                action={
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setSearch("");
                        setStatus("all");
                      }}
                    >
                      Clear filters
                    </Button>
                    <Button asChild size="sm">
                      <Link to="/advisors">Open Advisors site</Link>
                    </Button>
                  </div>
                }
              />
            ) : (
              query.data.map((inquiry) => (
                <button
                  key={inquiry.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(inquiry.id);
                    setAdminNotes(inquiry.adminNotes);
                  }}
                  className={`w-full rounded-xl border p-4 text-left transition ${
                    selectedId === inquiry.id
                      ? "border-primary bg-primary/5"
                      : "border-border/70 hover:border-primary/40"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {inquiry.name || inquiry.email || "Unnamed lead"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {inquiry.email || "No email"}
                        {inquiry.businessName ? ` · ${inquiry.businessName}` : ""}
                      </p>
                    </div>
                    <Badge variant="secondary">{inquiry.status}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {inquiry.serviceCode}
                    {inquiry.planCode ? ` · ${inquiry.planCode}` : ""} ·{" "}
                    {staffLabel(staff, inquiry.assignedAdvisorId)} ·{" "}
                    {new Date(inquiry.createdAt).toLocaleString()}
                  </p>
                </button>
              ))
            )}
          </section>

          <section className="space-y-4 rounded-xl border border-border/70 p-4">
            {!selected ? (
              <EmptyState
                title="Select an inquiry"
                description="Choose a lead to assign an advisor, update status or create a client record."
              />
            ) : (
              <>
                <div>
                  <h2 className="font-semibold">{selected.name || selected.email}</h2>
                  <p className="text-sm text-muted-foreground">
                    Source {selected.source} · {selected.serviceCode}
                  </p>
                  {selected.notes ? (
                    <p className="mt-2 text-sm whitespace-pre-wrap">{selected.notes}</p>
                  ) : null}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="assign-advisor">Assigned advisor</Label>
                  <RecordLookupSelect
                    id="assign-advisor"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    disabled={updateM.isPending || promoteM.isPending}
                    value={selected.assignedAdvisorId ?? ""}
                    onValueChange={(event) =>
                      updateM.mutate({
                        inquiryId: selected.id,
                        assignedAdvisorId: event || null,
                      })
                    }
                  >
                    <option value="">Unassigned</option>
                    {staff.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.displayName}
                        {member.isActive ? "" : " (inactive)"}
                      </option>
                    ))}
                  </RecordLookupSelect>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(["contacted", "qualified", "closed"] as const).map((next) => (
                    <Button
                      key={next}
                      type="button"
                      size="sm"
                      variant={selected.status === next ? "default" : "outline"}
                      disabled={updateM.isPending || promoteM.isPending || selected.status === next}
                      onClick={() => updateM.mutate({ inquiryId: selected.id, status: next })}
                    >
                      Mark {next}
                    </Button>
                  ))}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="inquiry-admin-notes">Admin notes</Label>
                  <Textarea
                    id="inquiry-admin-notes"
                    value={adminNotes}
                    onChange={(event) => setAdminNotes(event.target.value)}
                    rows={4}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      updateM.isPending || promoteM.isPending || adminNotes === selected.adminNotes
                    }
                    onClick={() => updateM.mutate({ inquiryId: selected.id, adminNotes })}
                  >
                    Save notes
                  </Button>
                </div>
                <Button
                  type="button"
                  disabled={promoteM.isPending || updateM.isPending || !selected.email}
                  onClick={() => promoteM.mutate(selected.id)}
                >
                  Promote to client
                </Button>
              </>
            )}
          </section>
        </div>
      </ListWorkspace>
    </main>
  );
}
