import { useMemo, useState } from "react";
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
  getAdvisorsEngagement,
  listAdvisorsEngagements,
  sendAdvisorsProposal,
  upsertAdvisorsEngagement,
  upsertAdvisorsProposal,
} from "@/lib/advisors/engagements.functions";
import {
  formatAdvisorsMoney,
  proposalPublicPath,
  type AdvisorsBillingInterval,
} from "@/lib/advisors/engagements";
import { listAdvisorsClients, listAdvisorsStaff } from "@/lib/advisors/management.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";

const STATUSES = [
  "all",
  "draft",
  "proposed",
  "accepted",
  "onboarding",
  "active",
  "paused",
  "closed",
] as const;

export function AdvisorsAdminEngagementsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listAdvisorsEngagements);
  const loadDetail = useServerFn(getAdvisorsEngagement);
  const upsertEngagement = useServerFn(upsertAdvisorsEngagement);
  const upsertProposal = useServerFn(upsertAdvisorsProposal);
  const sendProposal = useServerFn(sendAdvisorsProposal);
  const listClients = useServerFn(listAdvisorsClients);
  const listStaff = useServerFn(listAdvisorsStaff);

  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");
  const [search, setSearch] = useState("");
  const [reason, setReason] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState({
    clientId: "",
    assignedAdvisorId: "",
    serviceCode: "bookkeeping" as "bookkeeping" | "coaching",
    planCode: "",
    title: "",
    amountMinor: 19900,
    currency: "USD",
    billingInterval: "month" as AdvisorsBillingInterval,
    scopeSummary: "",
  });
  const [proposalDraft, setProposalDraft] = useState({
    title: "",
    summary: "",
    scopeText: "",
    exclusionsText: "Tax filing, audit and statutory representation are excluded.",
    amountMinor: 19900,
  });

  const clientsQ = useQuery({
    queryKey: ["advisors-clients", "all"],
    queryFn: () => listClients({ data: {} }),
    retry: false,
  });
  const staffQ = useQuery({
    queryKey: ["advisors-staff"],
    queryFn: () => listStaff(),
    retry: false,
  });
  const listQ = useQuery({
    queryKey: ["advisors-engagements", status, search],
    queryFn: () =>
      list({
        data: {
          status: status === "all" ? undefined : status,
          search: search || undefined,
        },
      }),
    retry: false,
  });
  const detailQ = useQuery({
    queryKey: ["advisors-engagement", selectedId],
    enabled: Boolean(selectedId),
    queryFn: () => loadDetail({ data: { engagementId: selectedId! } }),
    retry: false,
  });

  const createM = useMutation({
    mutationFn: () =>
      upsertEngagement({
        data: {
          clientId: form.clientId,
          assignedAdvisorId: form.assignedAdvisorId || null,
          serviceCode: form.serviceCode,
          planCode: form.planCode || null,
          title: form.title,
          amountMinor: form.amountMinor,
          currency: form.currency,
          billingInterval: form.billingInterval,
          scopeSummary: form.scopeSummary,
          reason: reason || "Created Advisors engagement",
        },
      }),
    onSuccess: async (engagement) => {
      toast.success("Engagement created");
      setReason("");
      setSelectedId(engagement.id);
      await qc.invalidateQueries({ queryKey: ["advisors-engagements"] });
      await qc.invalidateQueries({ queryKey: ["advisors-overview"] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const proposalM = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("Select an engagement first");
      const proposal = await upsertProposal({
        data: {
          engagementId: selectedId,
          title: proposalDraft.title || undefined,
          summary: proposalDraft.summary,
          scopeText: proposalDraft.scopeText,
          exclusionsText: proposalDraft.exclusionsText,
          amountMinor: proposalDraft.amountMinor,
          reason: reason || "Created Advisors proposal draft",
        },
      });
      return sendProposal({
        data: {
          proposalId: proposal.id,
          reason: reason || "Sent Advisors proposal to customer",
        },
      });
    },
    onSuccess: async (proposal) => {
      toast.success("Proposal sent");
      setReason("");
      await navigator.clipboard.writeText(
        `${window.location.origin}${proposalPublicPath(proposal.publicToken)}`,
      );
      toast.message("Public proposal link copied");
      await qc.invalidateQueries({ queryKey: ["advisors-engagement", selectedId] });
      await qc.invalidateQueries({ queryKey: ["advisors-engagements"] });
      await qc.invalidateQueries({ queryKey: ["advisors-overview"] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const clients = clientsQ.data ?? [];
  const staff = staffQ.data ?? [];
  const detail = detailQ.data;
  const selectedLabel = useMemo(() => {
    if (!detail) return null;
    return detail.clientName || detail.clientEmail || detail.title;
  }, [detail]);

  if (listQ.isPending || clientsQ.isPending || staffQ.isPending) return <LoadingState />;
  if (listQ.isError) {
    return (
      <main className="mx-auto max-w-6xl space-y-6 p-6">
        <ListWorkspace title="Engagements" description="Proposals and service delivery engagements.">
        <ErrorState
          title="Engagements unavailable"
          description={friendlyAuthError(listQ.error)}
          onRetry={() => void listQ.refetch()}
        />
          </ListWorkspace>
  </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <ListWorkspace
        title="Engagements"
        description="Create client engagements, send priced proposals and track acceptance. Acceptance does not start billing."
       subnav={<AdvisorsSubnav />}>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="engagement-search">Search</Label>
          <Input
            id="engagement-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Title, client or email"
            className="w-64"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="engagement-status">Status</Label>
          <select
            id="engagement-status"
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
        <div className="min-w-[16rem] flex-1 space-y-1">
          <Label htmlFor="engagement-reason">Change reason</Label>
          <Input
            id="engagement-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why are you changing this engagement?"
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <section className="space-y-2">
          {listQ.data.length === 0 ? (
            <EmptyState
              title="No engagements yet"
              description="Create an engagement for a client, then send a proposal."
            />
          ) : (
            listQ.data.map((engagement) => (
              <button
                key={engagement.id}
                type="button"
                onClick={() => setSelectedId(engagement.id)}
                className={`w-full rounded-xl border p-4 text-left transition ${
                  selectedId === engagement.id
                    ? "border-primary bg-primary/5"
                    : "border-border/70 hover:border-primary/40"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{engagement.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {engagement.clientName || engagement.clientEmail || engagement.clientId}
                    </p>
                  </div>
                  <Badge variant="secondary">{engagement.status}</Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {engagement.serviceCode}
                  {engagement.planCode ? ` · ${engagement.planCode}` : ""} ·{" "}
                  {formatAdvisorsMoney(engagement.amountMinor, engagement.currency)} ·{" "}
                  {engagement.proposalCount ?? 0} proposals
                </p>
              </button>
            ))
          )}
        </section>

        <div className="space-y-4">
          <section className="space-y-3 rounded-xl border border-border/70 p-4">
            <h2 className="font-semibold">New engagement</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="eng-client">Client</Label>
                <select
                  id="eng-client"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.clientId}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, clientId: event.target.value }))
                  }
                >
                  <option value="">Select client</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name || client.email} ({client.email})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="eng-title">Title</Label>
                <Input
                  id="eng-title"
                  value={form.title}
                  onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="eng-advisor">Advisor</Label>
                <select
                  id="eng-advisor"
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
              <div className="space-y-1">
                <Label htmlFor="eng-service">Service</Label>
                <select
                  id="eng-service"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.serviceCode}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      serviceCode: event.target.value as "bookkeeping" | "coaching",
                    }))
                  }
                >
                  <option value="bookkeeping">Bookkeeping</option>
                  <option value="coaching">Coaching</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="eng-plan">Plan code</Label>
                <Input
                  id="eng-plan"
                  value={form.planCode}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, planCode: event.target.value }))
                  }
                  placeholder="essential_books"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="eng-amount">Amount (minor units)</Label>
                <Input
                  id="eng-amount"
                  type="number"
                  value={form.amountMinor}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      amountMinor: Number(event.target.value) || 0,
                    }))
                  }
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="eng-scope">Scope summary</Label>
                <Textarea
                  id="eng-scope"
                  value={form.scopeSummary}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, scopeSummary: event.target.value }))
                  }
                  rows={3}
                />
              </div>
            </div>
            <Button
              type="button"
              disabled={createM.isPending || !form.clientId || !form.title}
              onClick={() => createM.mutate()}
            >
              Create engagement
            </Button>
          </section>

          <section className="space-y-3 rounded-xl border border-border/70 p-4">
            {!selectedId ? (
              <EmptyState
                title="Select an engagement"
                description="Open an engagement to review proposals and send a new one."
              />
            ) : detailQ.isPending ? (
              <LoadingState />
            ) : detailQ.isError ? (
              <ErrorState
                title="Engagement detail unavailable"
                description={friendlyAuthError(detailQ.error)}
                onRetry={() => void detailQ.refetch()}
              />
            ) : detail ? (
              <>
                <div>
                  <h2 className="font-semibold">{detail.title}</h2>
                  <p className="text-sm text-muted-foreground">
                    {selectedLabel} · {detail.status} ·{" "}
                    {formatAdvisorsMoney(detail.amountMinor, detail.currency)}
                  </p>
                </div>
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Proposals</h3>
                  {detail.proposals.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No proposals yet.</p>
                  ) : (
                    detail.proposals.map((proposal) => (
                      <div
                        key={proposal.id}
                        className="rounded-lg border border-border/50 px-3 py-2 text-sm"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span>
                            v{proposal.versionNumber} · {proposal.title}
                          </span>
                          <Badge variant="outline">{proposal.status}</Badge>
                        </div>
                        {proposal.status !== "draft" ? (
                          <p className="mt-1 break-all text-xs text-muted-foreground">
                            {proposalPublicPath(proposal.publicToken)}
                          </p>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Send proposal</h3>
                  <Input
                    value={proposalDraft.title}
                    onChange={(event) =>
                      setProposalDraft((prev) => ({ ...prev, title: event.target.value }))
                    }
                    placeholder="Proposal title"
                  />
                  <Textarea
                    value={proposalDraft.summary}
                    onChange={(event) =>
                      setProposalDraft((prev) => ({ ...prev, summary: event.target.value }))
                    }
                    placeholder="Customer-facing summary"
                    rows={2}
                  />
                  <Textarea
                    value={proposalDraft.scopeText}
                    onChange={(event) =>
                      setProposalDraft((prev) => ({ ...prev, scopeText: event.target.value }))
                    }
                    placeholder="Scope"
                    rows={3}
                  />
                  <Input
                    type="number"
                    value={proposalDraft.amountMinor}
                    onChange={(event) =>
                      setProposalDraft((prev) => ({
                        ...prev,
                        amountMinor: Number(event.target.value) || 0,
                      }))
                    }
                    placeholder="Amount minor units"
                  />
                  <Button
                    type="button"
                    disabled={proposalM.isPending}
                    onClick={() => proposalM.mutate()}
                  >
                    Create and send proposal
                  </Button>
                </div>
                {detail.agreements.length > 0 ? (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium">Agreements</h3>
                    {detail.agreements.map((agreement) => (
                      <div
                        key={agreement.id}
                        className="rounded-lg border border-border/50 px-3 py-2 text-sm"
                      >
                        v{agreement.versionNumber} · {agreement.status}
                        {agreement.acceptedName ? ` · ${agreement.acceptedName}` : ""}
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}
          </section>
        </div>
      </div>
        </ListWorkspace>
  </main>
  );
}
