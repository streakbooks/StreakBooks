import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { CrmSubnav } from "@/components/crm/CrmSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { EmptyState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { CRM_CAMPAIGN_STATUSES } from "@/lib/crm/campaign-draft";
import {
  getCrmSettings,
  listCrmCampaigns,
  listCrmLeadSources,
  upsertCrmCampaign,
} from "@/lib/crm/crm.functions";
import { formatCrmMinor } from "@/lib/crm/format";
import type { CrmCampaignStatus } from "@/lib/crm/types";
import type { Permission } from "@/lib/permissions";
import { toast } from "sonner";

export function CrmCampaignsPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canView =
    can("crm.view" as Permission) ||
    can("crm.campaigns.manage" as Permission) ||
    can("crm.admin" as Permission);
  const canManage = can("crm.campaigns.manage" as Permission) || can("crm.admin" as Permission);
  const queryClient = useQueryClient();
  const fetchSettings = useServerFn(getCrmSettings);
  const fetchSources = useServerFn(listCrmLeadSources);
  const fetchCampaigns = useServerFn(listCrmCampaigns);
  const saveCampaign = useServerFn(upsertCrmCampaign);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<CrmCampaignStatus>("planned");
  const [channel, setChannel] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [budgetMajor, setBudgetMajor] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");

  const settings = useQuery({
    queryKey: ["crm-settings", company?.id],
    queryFn: () => fetchSettings({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });

  const sources = useQuery({
    queryKey: ["crm-lead-sources", company?.id],
    queryFn: () => fetchSources({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView && settings.data?.enabled === true,
    retry: false,
  });

  const campaigns = useQuery({
    queryKey: ["crm-campaigns", company?.id],
    queryFn: () => fetchCampaigns({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView && settings.data?.enabled === true,
    retry: false,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!company) throw new Error("No organisation");
      return saveCampaign({
        data: {
          companyId: company.id,
          name,
          code: code || null,
          status,
          channel: channel || null,
          sourceId: sourceId || null,
          startsOn: startsOn || null,
          endsOn: endsOn || null,
          budgetMinor: Math.max(0, Math.round((Number(budgetMajor) || 0) * 100)),
          currencyCode: company.base_currency || "USD",
        },
      });
    },
    onSuccess: async () => {
      toast.success("Campaign saved");
      setShowForm(false);
      setName("");
      setCode("");
      setStatus("planned");
      setChannel("");
      setSourceId("");
      setBudgetMajor("");
      setStartsOn("");
      setEndsOn("");
      await queryClient.invalidateQueries({ queryKey: ["crm-campaigns", company?.id] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canView) {
    return (
      <ListWorkspace title="Campaigns & Sources" description="Attribution sources for leads.">
        <EmptyState title="No CRM access" description="Ask an administrator for crm.view." />
      </ListWorkspace>
    );
  }

  const campaignRows = campaigns.data ?? [];
  const sourceRows = sources.data ?? [];
  const currency = company.base_currency || "USD";

  return (
    <ListWorkspace
      title="Campaigns & Sources"
      description="Persist marketing campaigns and browse lead sources. Multi-touch attribution and spend journals stay out of scope."
      breadcrumbs={[{ label: "CRM", to: "/crm" }, { label: "Campaigns & Sources" }]}
      actions={
        canManage && settings.data?.enabled ? (
          <Button type="button" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Close form" : "New campaign"}
          </Button>
        ) : undefined
      }
      subnav={<CrmSubnav current="campaigns" />}
    >
      {settings.data && !settings.data.enabled ? (
        <EmptyState
          title="CRM is disabled"
          description="Enable CRM to load campaigns and sources."
        />
      ) : null}

      {settings.data?.enabled ? (
        <div className="space-y-4">
          <Alert>
            <AlertTitle>Accounting boundary</AlertTitle>
            <AlertDescription>
              Campaign budgets are CRM planning values only. They do not post GL journals or send
              email.
            </AlertDescription>
          </Alert>

          {showForm && canManage ? (
            <Card>
              <CardHeader>
                <CardTitle>New campaign</CardTitle>
                <CardDescription>Requires crm.campaigns.manage.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="campaign-name">Name</Label>
                  <Input
                    id="campaign-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="campaign-code">Code</Label>
                  <Input
                    id="campaign-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <RecordLookupSelect
                    value={status}
                    onValueChange={(v) => setStatus(v as CrmCampaignStatus)}
                  >
                    <SelectTrigger aria-label="Campaign status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CRM_CAMPAIGN_STATUSES.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </RecordLookupSelect>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="campaign-channel">Channel</Label>
                  <Input
                    id="campaign-channel"
                    value={channel}
                    onChange={(e) => setChannel(e.target.value)}
                    placeholder="email, ads, partner…"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Lead source</Label>
                  {sources.isError && sources.data === undefined ? (
                    <QueryErrorState queries={[sources]} title="Could not load lead sources" />
                  ) : (
                    <RecordLookupSelect
                      value={sourceId || "__none"}
                      onValueChange={(v) => setSourceId(v === "__none" ? "" : v)}
                    >
                      <SelectTrigger aria-label="Lead source">
                        <SelectValue placeholder="Optional source" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">No linked source</SelectItem>
                        {sourceRows.map((source) => (
                          <SelectItem key={source.id} value={source.id}>
                            {source.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </RecordLookupSelect>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="campaign-budget">Budget ({currency})</Label>
                  <Input
                    id="campaign-budget"
                    inputMode="decimal"
                    value={budgetMajor}
                    onChange={(e) => setBudgetMajor(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="campaign-start">Starts on</Label>
                  <Input
                    id="campaign-start"
                    type="date"
                    value={startsOn}
                    onChange={(e) => setStartsOn(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="campaign-end">Ends on</Label>
                  <Input
                    id="campaign-end"
                    type="date"
                    value={endsOn}
                    onChange={(e) => setEndsOn(e.target.value)}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Button
                    type="button"
                    disabled={createMutation.isPending || !name.trim()}
                    onClick={() => createMutation.mutate()}
                  >
                    {createMutation.isPending ? "Saving…" : "Create campaign"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {campaigns.isLoading ? <LoadingState /> : null}
          {campaigns.isError ? (
            <QueryErrorState queries={[campaigns]} title="Could not load campaigns" />
          ) : null}
          {campaigns.isSuccess && campaignRows.length === 0 ? (
            <EmptyState
              title="No campaigns yet"
              description="Create a campaign to track outreach separately from lead sources."
              action={
                canManage ? (
                  <Button size="sm" type="button" onClick={() => setShowForm(true)}>
                    New campaign
                  </Button>
                ) : undefined
              }
            />
          ) : null}
          {campaignRows.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaign</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead className="text-right">Budget</TableHead>
                    <TableHead>Dates</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaignRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium">{row.name}</div>
                        {row.code ? (
                          <div className="font-mono text-xs text-muted-foreground">{row.code}</div>
                        ) : null}
                      </TableCell>
                      <TableCell className="capitalize">{row.status}</TableCell>
                      <TableCell>{row.channel ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCrmMinor(row.budgetMinor, row.currencyCode)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {[row.startsOn, row.endsOn].filter(Boolean).join(" → ") || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Lead sources</CardTitle>
              <CardDescription>Seeded catalogue used when capturing leads.</CardDescription>
            </CardHeader>
            <CardContent>
              {sources.isLoading ? <LoadingState /> : null}
              {sources.isError ? (
                <QueryErrorState queries={[sources]} title="Could not load lead sources" />
              ) : null}
              {sourceRows.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sourceRows.map((source) => (
                        <TableRow key={source.id}>
                          <TableCell className="font-mono text-sm">{source.code}</TableCell>
                          <TableCell>{source.name}</TableCell>
                          <TableCell>{source.isActive ? "Active" : "Inactive"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </ListWorkspace>
  );
}
