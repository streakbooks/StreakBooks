import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { Link, useNavigate, useRouteContext } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { EmptyState, LoadingState } from "@/components/common/states";
import { RecordWorkspace } from "@/components/workspace/RecordWorkspace";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  assignCrmLead,
  convertCrmLead,
  findCrmConversionMatches,
  getCrmLead,
  scoreCrmLead,
  upsertCrmLead,
} from "@/lib/crm/crm.functions";
import { formatCrmMinor } from "@/lib/crm/format";
import { displayLeadName, type CrmLeadStatus } from "@/lib/crm/types";
import type { Permission } from "@/lib/permissions";
import { toast } from "sonner";

const STATUS_OPTIONS: CrmLeadStatus[] = [
  "new",
  "contacted",
  "qualified",
  "nurturing",
  "disqualified",
];

export function CrmLeadDetailPage({ leadId }: { leadId: string }) {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const { user } = useRouteContext({ from: "/_authenticated" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canManage = can("crm.leads.manage" as Permission);
  const fetchLead = useServerFn(getCrmLead);
  const saveLead = useServerFn(upsertCrmLead);
  const assignLead = useServerFn(assignCrmLead);
  const convertLead = useServerFn(convertCrmLead);
  const fetchMatches = useServerFn(findCrmConversionMatches);
  const scoreLead = useServerFn(scoreCrmLead);
  const [status, setStatus] = useState<CrmLeadStatus | null>(null);
  const [selectedContactId, setSelectedContactId] = useState<string>("");
  const [allowCreateDespiteMatch, setAllowCreateDespiteMatch] = useState(false);
  const [scoreExplainer, setScoreExplainer] = useState<string | null>(null);

  const leadQuery = useQuery({
    queryKey: ["crm-lead", company?.id, leadId],
    queryFn: () => fetchLead({ data: { companyId: company!.id, leadId } }),
    enabled: Boolean(company?.id) && Boolean(leadId),
    retry: false,
  });

  const matchesQuery = useQuery({
    queryKey: ["crm-conversion-matches", company?.id, leadId],
    queryFn: () => fetchMatches({ data: { companyId: company!.id, leadId } }),
    enabled:
      Boolean(company?.id) &&
      Boolean(leadId) &&
      canManage &&
      leadQuery.data?.status !== "converted",
    retry: false,
  });

  const statusMutation = useMutation({
    mutationFn: async (next: CrmLeadStatus) => {
      if (!company || !leadQuery.data) throw new Error("Lead not loaded");
      return saveLead({
        data: {
          companyId: company.id,
          id: leadQuery.data.id,
          status: next,
          ...(leadQuery.data.firstName ? { firstName: leadQuery.data.firstName } : {}),
          ...(leadQuery.data.lastName ? { lastName: leadQuery.data.lastName } : {}),
          ...(leadQuery.data.organizationName
            ? { organizationName: leadQuery.data.organizationName }
            : {}),
          ...(leadQuery.data.email ? { email: leadQuery.data.email } : {}),
        },
      });
    },
    onSuccess: async () => {
      toast.success("Lead status updated");
      await queryClient.invalidateQueries({ queryKey: ["crm-lead", company?.id, leadId] });
      await queryClient.invalidateQueries({ queryKey: ["crm-leads", company?.id] });
      await queryClient.invalidateQueries({ queryKey: ["crm-dashboard-kpis", company?.id] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!company || !user?.id) throw new Error("Missing user");
      return assignLead({
        data: { companyId: company.id, leadId, ownerUserId: user.id },
      });
    },
    onSuccess: async () => {
      toast.success("Lead assigned to you");
      await queryClient.invalidateQueries({ queryKey: ["crm-lead", company?.id, leadId] });
      await queryClient.invalidateQueries({ queryKey: ["crm-dashboard-kpis", company?.id] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const scoreMutation = useMutation({
    mutationFn: async () => {
      if (!company) throw new Error("No organisation");
      return scoreLead({ data: { companyId: company.id, leadId, persist: true } });
    },
    onSuccess: async (result) => {
      setScoreExplainer(result.formula);
      toast.success(`Lead scored ${result.score}/100`);
      await queryClient.invalidateQueries({ queryKey: ["crm-lead", company?.id, leadId] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const convertMutation = useMutation({
    mutationFn: async () => {
      if (!company) throw new Error("No organisation");
      const matches = matchesQuery.data?.matches ?? [];
      const existing =
        selectedContactId ||
        leadQuery.data?.contactId ||
        (matches.length === 1 ? matches[0]?.id : null) ||
        null;
      return convertLead({
        data: {
          companyId: company.id,
          leadId,
          createOpportunity: true,
          existingContactId: existing,
          allowCreateDespiteMatch: matches.length > 0 ? allowCreateDespiteMatch : false,
        },
      });
    },
    onSuccess: async (result) => {
      toast.success("Lead converted to customer");
      await queryClient.invalidateQueries({ queryKey: ["crm-lead", company?.id, leadId] });
      await queryClient.invalidateQueries({ queryKey: ["crm-leads", company?.id] });
      await queryClient.invalidateQueries({ queryKey: ["crm-opportunities", company?.id] });
      await queryClient.invalidateQueries({ queryKey: ["crm-dashboard-kpis", company?.id] });
      if (result.opportunityId) {
        await navigate({ to: "/crm/$section", params: { section: "opportunities" } });
      }
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }

  if (leadQuery.isLoading) {
    return (
      <RecordWorkspace title="Lead" description="Loading lead…">
        <LoadingState />
      </RecordWorkspace>
    );
  }
  if (leadQuery.isError) {
    return (
      <RecordWorkspace title="Lead" description="Lead detail">
        <QueryErrorState queries={[leadQuery]} title="Could not load lead" />
      </RecordWorkspace>
    );
  }
  const lead = leadQuery.data;
  if (!lead) {
    return (
      <RecordWorkspace title="Lead" description="Lead detail">
        <EmptyState title="Lead not found" description="It may have been removed." />
      </RecordWorkspace>
    );
  }

  const statusValue = status ?? lead.status;
  const converted = lead.status === "converted";

  return (
    <RecordWorkspace
      title={displayLeadName(lead)}
      description={`${lead.leadNumber} · ${lead.status}`}
      breadcrumbs={[
        { label: "CRM", to: "/crm" },
        { label: "Leads", to: "/crm/leads" },
        { label: lead.leadNumber },
      ]}
      actions={
        canManage && !converted ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={assignMutation.isPending}
              onClick={() => assignMutation.mutate()}
            >
              Assign to me
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={scoreMutation.isPending}
              onClick={() => scoreMutation.mutate()}
            >
              {scoreMutation.isPending ? "Scoring…" : "Recalculate score"}
            </Button>
            <Button
              type="button"
              disabled={convertMutation.isPending || lead.status === "disqualified"}
              onClick={() => convertMutation.mutate()}
            >
              {convertMutation.isPending ? "Converting…" : "Convert to customer"}
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
            <CardDescription>Identity and commercial estimate</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Organisation:</span>{" "}
              {lead.organizationName ?? "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Person:</span>{" "}
              {[lead.firstName, lead.lastName].filter(Boolean).join(" ") || "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Email:</span> {lead.email ?? "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Phone:</span> {lead.phone ?? "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Estimated value:</span>{" "}
              {formatCrmMinor(lead.estimatedValueMinor, lead.currencyCode)}
            </p>
            <p>
              <span className="text-muted-foreground">Owner:</span>{" "}
              {lead.ownerUserId ? lead.ownerUserId.slice(0, 8) + "…" : "Unassigned"}
            </p>
            {lead.contactId ? (
              <p>
                <span className="text-muted-foreground">Contact:</span>{" "}
                <Link
                  to="/contacts/$contactId"
                  params={{ contactId: lead.contactId }}
                  className="text-primary underline-offset-4 hover:underline"
                >
                  Open contact
                </Link>
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lifecycle</CardTitle>
            <CardDescription>Stage changes are audited on the server</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {converted ? (
              <p className="text-sm">
                Converted {lead.convertedAt ? new Date(lead.convertedAt).toLocaleString() : ""}.
                Duplicate conversion is blocked.
              </p>
            ) : canManage ? (
              <div className="space-y-2">
                <Label>Status</Label>
                <RecordLookupSelect
                  value={statusValue}
                  onValueChange={(value) => {
                    const next = value as CrmLeadStatus;
                    setStatus(next);
                    statusMutation.mutate(next);
                  }}
                  disabled={statusMutation.isPending}
                >
                  <SelectTrigger aria-label="Lead status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </RecordLookupSelect>
              </div>
            ) : (
              <p className="capitalize text-sm">{lead.status}</p>
            )}
            {lead.notes ? (
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{lead.notes}</p>
            ) : null}
            <p className="text-sm">
              <span className="text-muted-foreground">Score:</span>{" "}
              <span className="font-medium tabular-nums">{lead.score}/100</span>
            </p>
            {scoreExplainer ? (
              <p className="text-xs text-muted-foreground">{scoreExplainer}</p>
            ) : null}
          </CardContent>
        </Card>

        {!converted && canManage ? (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Conversion matches</CardTitle>
              <CardDescription>
                Reuse the Contacts master. Select a match to prevent duplicate customers.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {matchesQuery.isLoading ? <LoadingState /> : null}
              {matchesQuery.isError ? (
                <QueryErrorState queries={[matchesQuery]} title="Could not check matches" />
              ) : null}
              {matchesQuery.isSuccess && (matchesQuery.data.matches?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No matching contacts found. Conversion creates a new customer when authorised.
                </p>
              ) : null}
              {matchesQuery.isSuccess && (matchesQuery.data.matches?.length ?? 0) > 0 ? (
                <div className="space-y-2">
                  <Label>Use existing contact</Label>
                  <RecordLookupSelect
                    value={selectedContactId || "__none"}
                    onValueChange={(v) => setSelectedContactId(v === "__none" ? "" : v)}
                  >
                    <SelectTrigger aria-label="Matching contact">
                      <SelectValue placeholder="Select matching contact" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Select contact…</SelectItem>
                      {(matchesQuery.data.matches ?? []).map((match) => (
                        <SelectItem key={match.id} value={match.id}>
                          {match.name}
                          {match.email ? ` · ${match.email}` : ""} (score {match.score})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </RecordLookupSelect>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={allowCreateDespiteMatch}
                      onChange={(e) => setAllowCreateDespiteMatch(e.target.checked)}
                    />
                    Create a new contact anyway (explicit override)
                  </label>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </RecordWorkspace>
  );
}
