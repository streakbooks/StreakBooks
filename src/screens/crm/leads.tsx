import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { CrmSubnav } from "@/components/crm/CrmSubnav";
import { CrmStatusBadge } from "@/components/crm/CrmStatusBadge";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { EmptyState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  findCrmDuplicateLeads,
  getCrmSettings,
  listCrmLeads,
  listCrmLeadSources,
  upsertCrmLead,
} from "@/lib/crm/crm.functions";
import { formatCrmMinor } from "@/lib/crm/format";
import { validateCrmLeadForm } from "@/lib/crm/lead-form";
import { displayLeadName, type CrmLeadStatus } from "@/lib/crm/types";
import type { Permission } from "@/lib/permissions";
import { toast } from "sonner";

const LEADS_PAGE_SIZE = 50;

export function CrmLeadsPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canView = can("crm.view" as Permission) || can("crm.admin" as Permission);
  const canManage = can("crm.leads.manage" as Permission);
  const queryClient = useQueryClient();
  const fetchSettings = useServerFn(getCrmSettings);
  const fetchLeads = useServerFn(listCrmLeads);
  const fetchSources = useServerFn(listCrmLeadSources);
  const createLead = useServerFn(upsertCrmLead);
  const findDuplicates = useServerFn(findCrmDuplicateLeads);
  const [ackDuplicates, setAckDuplicates] = useState(false);

  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [searchTerm, setSearchTerm] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(0);
  useEffect(() => {
    const handle = setTimeout(() => {
      setAppliedSearch(searchTerm.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchTerm]);
  const [showForm, setShowForm] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [sourceId, setSourceId] = useState<string>("");
  const [estimatedMajor, setEstimatedMajor] = useState("");
  const validation = validateCrmLeadForm({
    firstName,
    lastName,
    organizationName,
    email,
    estimatedMajor,
  });
  const duplicateCheckRequired = Boolean(email.trim() || phone.trim() || organizationName.trim());

  const dupQuery = useQuery({
    queryKey: ["crm-lead-dups", company?.id, email, phone, organizationName],
    queryFn: () => {
      const data: {
        companyId: string;
        email?: string;
        phone?: string;
        organizationName?: string;
      } = { companyId: company!.id };
      if (email.trim()) data.email = email.trim();
      if (phone.trim()) data.phone = phone.trim();
      if (organizationName.trim()) data.organizationName = organizationName.trim();
      return findDuplicates({ data });
    },
    enabled:
      Boolean(company?.id) &&
      showForm &&
      canManage &&
      Boolean(email.trim() || phone.trim() || organizationName.trim()),
    retry: false,
  });
  const dupMatches = dupQuery.data?.matches ?? [];
  const duplicateCheckReady =
    !duplicateCheckRequired || (dupQuery.isSuccess && !dupQuery.isFetching);

  const settings = useQuery({
    queryKey: ["crm-settings", company?.id],
    queryFn: () => fetchSettings({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });

  const leads = useQuery({
    queryKey: ["crm-leads", company?.id, statusFilter, appliedSearch, page],
    queryFn: () =>
      fetchLeads({
        data: {
          companyId: company!.id,
          ...(statusFilter === "open"
            ? { activeOnly: true }
            : statusFilter === "all"
              ? {}
              : { status: statusFilter }),
          q: appliedSearch,
          limit: LEADS_PAGE_SIZE + 1,
          offset: page * LEADS_PAGE_SIZE,
        },
      }),
    enabled: Boolean(company?.id) && canView && settings.data?.enabled === true,
    retry: false,
  });

  const sources = useQuery({
    queryKey: ["crm-lead-sources", company?.id],
    queryFn: () => fetchSources({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView && settings.data?.enabled === true,
    retry: false,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!company) throw new Error("No organisation");
      const checked = validateCrmLeadForm({
        firstName,
        lastName,
        organizationName,
        email,
        estimatedMajor,
      });
      if (!checked.valid) throw new Error(checked.message);
      if (!duplicateCheckReady) throw new Error("Complete the duplicate check before saving.");
      if (dupMatches.length > 0 && !ackDuplicates) {
        throw new Error("Review possible duplicate leads before creating a new record.");
      }
      const estimatedValueMinor = checked.estimatedValueMinor;
      return createLead({
        data: {
          companyId: company.id,
          status: "new" as CrmLeadStatus,
          firstName,
          lastName,
          organizationName,
          email,
          phone,
          sourceId: sourceId || null,
          estimatedValueMinor,
          currencyCode: company.base_currency,
        },
      });
    },
    onSuccess: async (result) => {
      toast.success(`Lead ${result.leadNumber} created`);
      setShowForm(false);
      setFirstName("");
      setLastName("");
      setOrganizationName("");
      setEmail("");
      setPhone("");
      setSourceId("");
      setEstimatedMajor("");
      setAckDuplicates(false);
      await queryClient.invalidateQueries({ queryKey: ["crm-leads", company?.id] });
      await queryClient.invalidateQueries({ queryKey: ["crm-dashboard-kpis", company?.id] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canView) {
    return (
      <ListWorkspace title="Leads" description="Capture and qualify sales leads.">
        <EmptyState title="No CRM access" description="Ask an administrator for crm.view." />
      </ListWorkspace>
    );
  }

  const rows = (leads.data ?? []).slice(0, LEADS_PAGE_SIZE);
  const hasNextPage = (leads.data?.length ?? 0) > LEADS_PAGE_SIZE;

  return (
    <ListWorkspace
      title="Leads"
      description="Lead capture, qualification and conversion into Contacts."
      breadcrumbs={[{ label: "CRM", to: "/crm" }, { label: "Leads" }]}
      actions={
        canManage && settings.data?.enabled ? (
          <Button
            type="button"
            onClick={() => {
              setShowForm((v) => !v);
              setAckDuplicates(false);
            }}
          >
            {showForm ? "Close form" : "New lead"}
          </Button>
        ) : undefined
      }
      subnav={<CrmSubnav current="leads" />}
    >
      {settings.isLoading ? <LoadingState /> : null}
      {settings.data && !settings.data.enabled ? (
        <EmptyState
          title="CRM is disabled"
          description="Enable CRM in settings before creating leads."
          action={
            can("crm.admin" as Permission) ? (
              <Button asChild>
                <Link to="/crm/$section" params={{ section: "settings" }}>
                  CRM Settings
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : null}

      {settings.data?.enabled ? (
        <div className="space-y-4">
          {showForm && canManage ? (
            <Card>
              <CardHeader>
                <CardTitle>New lead</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="lead-first">First name</Label>
                  <Input
                    id="lead-first"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lead-last">Last name</Label>
                  <Input
                    id="lead-last"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="lead-org">Organisation</Label>
                  <Input
                    id="lead-org"
                    value={organizationName}
                    onChange={(e) => {
                      setOrganizationName(e.target.value);
                      setAckDuplicates(false);
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lead-email">Email</Label>
                  <Input
                    id="lead-email"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setAckDuplicates(false);
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lead-phone">Phone</Label>
                  <Input
                    id="lead-phone"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      setAckDuplicates(false);
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Source</Label>
                  {sources.isError && sources.data === undefined ? (
                    <QueryErrorState queries={[sources]} title="Could not load lead sources" />
                  ) : (
                    <RecordLookupSelect
                      value={sourceId || "__none"}
                      onValueChange={(v) => setSourceId(v === "__none" ? "" : v)}
                    >
                      <SelectTrigger aria-label="Lead source">
                        <SelectValue placeholder="Select source" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">No source</SelectItem>
                        {(sources.data ?? []).map((source) => (
                          <SelectItem key={source.id} value={source.id}>
                            {source.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </RecordLookupSelect>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lead-value">Estimated value ({company.base_currency})</Label>
                  <Input
                    id="lead-value"
                    inputMode="decimal"
                    value={estimatedMajor}
                    onChange={(e) => setEstimatedMajor(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                {dupMatches.length > 0 ? (
                  <div className="sm:col-span-2 space-y-3">
                    <Alert>
                      <AlertTitle>Possible duplicate leads</AlertTitle>
                      <AlertDescription>
                        <ul className="mt-2 list-disc space-y-1 pl-4">
                          {dupMatches.slice(0, 5).map(
                            (
                              match: {
                                id: string;
                                lead_number?: string;
                                leadNumber?: string;
                                email?: string | null;
                                status?: string;
                              },
                              idx: number,
                            ) => (
                              <li key={String(match["id"] ?? idx)}>
                                {String(
                                  match["lead_number"] ??
                                    match["leadNumber"] ??
                                    match["id"] ??
                                    "Lead",
                                )}
                                {match["email"] ? ` · ${String(match["email"])}` : ""}
                                {match["status"] ? ` (${String(match["status"])})` : ""}
                              </li>
                            ),
                          )}
                        </ul>
                        <label className="mt-3 flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={ackDuplicates}
                            onChange={(e) => setAckDuplicates(e.target.checked)}
                          />
                          Create anyway — I reviewed these matches
                        </label>
                      </AlertDescription>
                    </Alert>
                  </div>
                ) : null}
                <div className="sm:col-span-2">
                  {!validation.valid ? (
                    <p role="alert" className="mb-3 text-sm text-destructive">
                      {validation.message}
                    </p>
                  ) : null}
                  {duplicateCheckRequired && !duplicateCheckReady && !dupQuery.isError ? (
                    <p role="status" className="mb-3 text-sm text-muted-foreground">
                      Checking possible duplicate leads before saving…
                    </p>
                  ) : null}
                  {dupQuery.isError ? (
                    <div className="mb-3">
                      <QueryErrorState
                        queries={[dupQuery]}
                        title="Duplicate check unavailable"
                      />
                    </div>
                  ) : null}
                  <Button
                    type="button"
                    disabled={
                      createMutation.isPending ||
                      !validation.valid ||
                      !duplicateCheckReady ||
                      (dupMatches.length > 0 && !ackDuplicates)
                    }
                    onClick={() => createMutation.mutate()}
                  >
                    {createMutation.isPending ? "Saving…" : "Create lead"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Label htmlFor="lead-search" className="sr-only">
              Search loaded leads
            </Label>
            <Input
              id="lead-search"
              type="search"
              placeholder="Search all leads by name, email or number"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full sm:max-w-sm"
            />
            <Label htmlFor="lead-status-filter" className="sr-only">
              Status filter
            </Label>
            <Select
              value={statusFilter}
              onValueChange={(value) => {
                setStatusFilter(value);
                setPage(0);
              }}
            >
              <SelectTrigger id="lead-status-filter" className="w-48" aria-label="Filter leads">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open leads</SelectItem>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="contacted">Contacted</SelectItem>
                <SelectItem value="qualified">Qualified</SelectItem>
                <SelectItem value="nurturing">Nurturing</SelectItem>
                <SelectItem value="converted">Converted</SelectItem>
                <SelectItem value="disqualified">Disqualified</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {leads.isSuccess ? (
            <p className="text-xs text-muted-foreground" role="status">
              Page {page + 1}: showing {rows.length} leads, searched and filtered securely on the
              server. {hasNextPage ? "More results available." : "No further results."}
            </p>
          ) : null}
          {leads.isLoading ? <LoadingState /> : null}
          {leads.isError ? (
            <QueryErrorState queries={[leads]} title="Could not load leads" />
          ) : null}
          {leads.isSuccess && rows.length === 0 ? (
            <EmptyState
              title={appliedSearch ? "No matching leads" : "No leads in this view"}
              description={
                appliedSearch
                  ? "Try a different search or status filter."
                  : "Create a lead to start the CRM lifecycle."
              }
              action={
                !appliedSearch && canManage && settings.data?.enabled ? (
                  <Button
                    size="sm"
                    type="button"
                    onClick={() => {
                      setShowForm(true);
                      setAckDuplicates(false);
                    }}
                  >
                    New lead
                  </Button>
                ) : undefined
              }
            />
          ) : null}
          {rows.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Number</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-right">Est. value</TableHead>
                    <TableHead>Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell>
                        <Link
                          to="/crm/leads/$leadId"
                          params={{ leadId: lead.id }}
                          className="font-medium text-primary underline-offset-4 hover:underline"
                        >
                          {lead.leadNumber}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link
                          to="/crm/leads/$leadId"
                          params={{ leadId: lead.id }}
                          className="font-medium text-foreground underline-offset-4 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {displayLeadName(lead)}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <CrmStatusBadge status={lead.status} />
                      </TableCell>
                      <TableCell>{lead.email ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCrmMinor(lead.estimatedValueMinor, lead.currencyCode)}
                      </TableCell>
                      <TableCell>
                        {lead.updatedAt ? new Date(lead.updatedAt).toLocaleString() : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
          {leads.isSuccess && (page > 0 || hasNextPage) ? (
            <nav
              aria-label="Lead list pages"
              className="flex flex-wrap items-center justify-between gap-3"
            >
              <p className="text-sm text-muted-foreground">Page {page + 1}</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={page === 0 || leads.isFetching}
                  onClick={() => setPage((value) => Math.max(0, value - 1))}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!hasNextPage || leads.isFetching}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next
                </Button>
              </div>
            </nav>
          ) : null}
        </div>
      ) : null}
    </ListWorkspace>
  );
}
