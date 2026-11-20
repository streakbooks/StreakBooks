import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { CrmSubnav } from "@/components/crm/CrmSubnav";
import { CrmStatusBadge } from "@/components/crm/CrmStatusBadge";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { EmptyState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  getCrmSettings,
  listCrmAccountOverlay,
  listCrmOpportunities,
  listCrmPipelines,
  reopenCrmOpportunity,
  setCrmOpportunityStage,
  upsertCrmOpportunity,
} from "@/lib/crm/crm.functions";
import { formatCrmMinor } from "@/lib/crm/format";
import { validateOpportunityForm } from "@/lib/crm/opportunity-form";
import type { Permission } from "@/lib/permissions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const OPPORTUNITY_PAGE_SIZE = 50;

export function CrmOpportunitiesPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canView = can("crm.view" as Permission) || can("crm.admin" as Permission);
  const canManage = can("crm.opportunities.manage" as Permission);
  const queryClient = useQueryClient();
  const fetchSettings = useServerFn(getCrmSettings);
  const fetchOpps = useServerFn(listCrmOpportunities);
  const fetchPipelines = useServerFn(listCrmPipelines);
  const fetchAccounts = useServerFn(listCrmAccountOverlay);
  const createOpp = useServerFn(upsertCrmOpportunity);
  const moveStage = useServerFn(setCrmOpportunityStage);
  const reopenOpp = useServerFn(reopenCrmOpportunity);

  const [view, setView] = useState<"list" | "kanban">("kanban");
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [amountMajor, setAmountMajor] = useState("");
  const [contactId, setContactId] = useState("");
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
  const formValidation = validateOpportunityForm(name, amountMajor);
  const [stageId, setStageId] = useState("");
  const [selectedPipelineId, setSelectedPipelineId] = useState("");

  const settings = useQuery({
    queryKey: ["crm-settings", company?.id],
    queryFn: () => fetchSettings({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });

  const pipelines = useQuery({
    queryKey: ["crm-pipelines", company?.id],
    queryFn: () => fetchPipelines({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView && settings.data?.enabled === true,
    retry: false,
  });

  const activePipelines = (pipelines.data?.pipelines ?? []).filter((pipeline) => pipeline.isActive);
  const effectivePipelineId =
    activePipelines.find((pipeline) => pipeline.id === selectedPipelineId)?.id ??
    activePipelines.find((pipeline) => pipeline.isDefault)?.id ??
    activePipelines[0]?.id;

  const opps = useQuery({
    queryKey: ["crm-opportunities", company?.id, "open", effectivePipelineId, appliedSearch, page],
    queryFn: () =>
      fetchOpps({
        data: {
          companyId: company!.id,
          status: "open",
          ...(effectivePipelineId ? { pipelineId: effectivePipelineId } : {}),
          q: appliedSearch,
          limit: OPPORTUNITY_PAGE_SIZE + 1,
          offset: page * OPPORTUNITY_PAGE_SIZE,
        },
      }),
    enabled:
      Boolean(company?.id) &&
      canView &&
      settings.data?.enabled === true &&
      Boolean(effectivePipelineId),
    retry: false,
  });

  const closedOpps = useQuery({
    queryKey: ["crm-opportunities", company?.id, "closed", effectivePipelineId],
    queryFn: async () => {
      const [won, lost] = await Promise.all([
        fetchOpps({
          data: {
            companyId: company!.id,
            status: "won",
            ...(effectivePipelineId ? { pipelineId: effectivePipelineId } : {}),
          },
        }),
        fetchOpps({
          data: {
            companyId: company!.id,
            status: "lost",
            ...(effectivePipelineId ? { pipelineId: effectivePipelineId } : {}),
          },
        }),
      ]);
      return [...won, ...lost];
    },
    enabled:
      Boolean(company?.id) &&
      canView &&
      settings.data?.enabled === true &&
      Boolean(effectivePipelineId),
    retry: false,
  });

  const accounts = useQuery({
    queryKey: ["crm-account-options", company?.id],
    queryFn: () => fetchAccounts({ data: { companyId: company!.id, limit: 200 } }),
    enabled: Boolean(company?.id) && canManage && showForm && settings.data?.enabled === true,
    retry: false,
  });

  const defaultPipeline = useMemo(() => {
    const list = (pipelines.data?.pipelines ?? []).filter((pipeline) => pipeline.isActive);
    return list.find((p) => p.isDefault) ?? list[0] ?? null;
  }, [pipelines.data]);

  const selectedPipeline = useMemo(() => {
    const list = pipelines.data?.pipelines ?? [];
    return list.find((pipeline) => pipeline.id === selectedPipelineId) ?? defaultPipeline;
  }, [pipelines.data, defaultPipeline, selectedPipelineId]);

  const stages = useMemo(() => {
    if (!selectedPipeline) return [];
    return (pipelines.data?.stages ?? [])
      .filter((s) => s.pipelineId === selectedPipeline.id && s.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [pipelines.data, selectedPipeline]);

  const filteredOpenDeals = (opps.data ?? []).slice(0, OPPORTUNITY_PAGE_SIZE);
  const hasNextPage = (opps.data?.length ?? 0) > OPPORTUNITY_PAGE_SIZE;

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!company) throw new Error("No organisation");
      const checked = validateOpportunityForm(name, amountMajor);
      if (!checked.valid) throw new Error(checked.message);
      const initialStageId = stageId || stages.find((s) => !s.isWon && !s.isLost)?.id;
      if (!selectedPipeline || !initialStageId) {
        throw new Error(
          "Configure at least one active sales pipeline stage before creating an opportunity.",
        );
      }
      return createOpp({
        data: {
          companyId: company.id,
          name,
          ...(selectedPipeline?.id ? { pipelineId: selectedPipeline.id } : {}),
          ...(initialStageId ? { stageId: initialStageId } : {}),
          contactId: contactId || null,
          amountMinor: checked.amountMinor,
          currencyCode: company.base_currency,
        },
      });
    },
    onSuccess: async () => {
      toast.success("Opportunity created");
      setShowForm(false);
      setName("");
      setAmountMajor("");
      setContactId("");
      setStageId("");
      await queryClient.invalidateQueries({ queryKey: ["crm-opportunities", company?.id] });
      await queryClient.invalidateQueries({ queryKey: ["crm-dashboard-kpis", company?.id] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const moveMutation = useMutation({
    mutationFn: async (input: {
      opportunityId: string;
      nextStageId: string;
      expectedVersion: number;
    }) => {
      if (!company) throw new Error("No organisation");
      return moveStage({
        data: {
          companyId: company.id,
          opportunityId: input.opportunityId,
          stageId: input.nextStageId,
          expectedVersion: input.expectedVersion,
        },
      });
    },
    onSuccess: async () => {
      toast.success("Stage updated");
      await queryClient.invalidateQueries({ queryKey: ["crm-opportunities", company?.id] });
      await queryClient.invalidateQueries({ queryKey: ["crm-dashboard-kpis", company?.id] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const reopenMutation = useMutation({
    mutationFn: async (opportunityId: string) => {
      if (!company) throw new Error("No organisation");
      return reopenOpp({ data: { companyId: company.id, opportunityId } });
    },
    onSuccess: async () => {
      toast.success("Opportunity reopened");
      await queryClient.invalidateQueries({ queryKey: ["crm-opportunities", company?.id] });
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
      <ListWorkspace title="Opportunities" description="Deals and pipeline.">
        <EmptyState title="No CRM access" description="Ask an administrator for crm.view." />
      </ListWorkspace>
    );
  }

  return (
    <ListWorkspace
      title="Opportunities"
      description="Pipeline deals with persisted stage changes. Values are CRM forecasts, not GL revenue."
      breadcrumbs={[{ label: "CRM", to: "/crm" }, { label: "Opportunities" }]}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={view === "kanban" ? "default" : "secondary"}
            onClick={() => setView("kanban")}
          >
            Board
          </Button>
          <Button
            type="button"
            variant={view === "list" ? "default" : "secondary"}
            onClick={() => setView("list")}
          >
            List
          </Button>
          {canManage && settings.data?.enabled ? (
            <Button type="button" onClick={() => setShowForm((v) => !v)}>
              {showForm ? "Close form" : "New opportunity"}
            </Button>
          ) : null}
        </div>
      }
      subnav={<CrmSubnav current="opportunities" />}
    >
      {settings.isLoading ? <LoadingState /> : null}
      {settings.isError ? (
        <QueryErrorState queries={[settings]} title="Could not load CRM settings" />
      ) : null}

      {settings.isSuccess && settings.data && !settings.data.enabled ? (
        <EmptyState
          title="CRM is disabled"
          description="Enable CRM before creating opportunities."
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

      {settings.isSuccess && settings.data?.enabled ? (
        <div className="space-y-4">
          {showForm && canManage ? (
            <Card>
              <CardHeader>
                <CardTitle>New opportunity</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="opp-name">Name</Label>
                  <Input id="opp-name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="opp-amount">Amount ({company.base_currency})</Label>
                  <Input
                    id="opp-amount"
                    inputMode="decimal"
                    value={amountMajor}
                    onChange={(e) => setAmountMajor(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Customer / Account</Label>
                  {accounts.isError ? (
                    <QueryErrorState
                      queries={[accounts]}
                      title="Customer list unavailable"
                      description="An unlinked deal can be saved, but quote creation will remain blocked."
                    />
                  ) : (
                    <RecordLookupSelect
                      value={contactId || "__none"}
                      onValueChange={(value) => setContactId(value === "__none" ? "" : value)}
                    >
                      <SelectTrigger aria-label="Customer linked to opportunity">
                        <SelectValue placeholder="Link existing customer" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">No customer linked</SelectItem>
                        {(accounts.data ?? []).map((account) => (
                          <SelectItem key={account.contactId} value={account.contactId}>
                            {account.name}
                            {account.email ? ` · ${account.email}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </RecordLookupSelect>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Reuses the shared Contacts master. A linked customer and positive value are
                    needed before creating a Sales quote.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Stage</Label>
                  {pipelines.isError ? null : (
                    <RecordLookupSelect
                      value={stageId || "__default"}
                      onValueChange={(v) => setStageId(v === "__default" ? "" : v)}
                    >
                      <SelectTrigger aria-label="Opportunity stage">
                        <SelectValue placeholder="Default first stage" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__default">Default first stage</SelectItem>
                        {stages
                          .filter((s) => !s.isWon && !s.isLost)
                          .map((stage) => (
                            <SelectItem key={stage.id} value={stage.id}>
                              {stage.name} ({stage.probabilityPct}%)
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </RecordLookupSelect>
                  )}
                </div>
                <div className="sm:col-span-2 space-y-2">
                  {!formValidation.valid ? (
                    <p className="text-sm text-destructive" role="alert">
                      {formValidation.message}
                    </p>
                  ) : null}
                  {pipelines.isError ? (
                    <QueryErrorState
                      queries={[pipelines]}
                      title="Could not load pipelines"
                      description="Retry before creating a deal."
                    />
                  ) : null}
                  <Button
                    type="button"
                    disabled={
                      createMutation.isPending ||
                      !formValidation.valid ||
                      !selectedPipeline ||
                      pipelines.isLoading ||
                      pipelines.isError
                    }
                    onClick={() => createMutation.mutate()}
                  >
                    {createMutation.isPending ? "Saving…" : "Create opportunity"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-40 space-y-1">
              <Label htmlFor="crm-pipeline-picker">Pipeline</Label>
              {pipelines.isError ? null : (
                <RecordLookupSelect
                  value={selectedPipeline?.id ?? ""}
                  onValueChange={(value) => {
                    setSelectedPipelineId(value);
                    setStageId("");
                    setPage(0);
                  }}
                >
                  <SelectTrigger id="crm-pipeline-picker" aria-label="Select CRM pipeline">
                    <SelectValue placeholder="Choose pipeline" />
                  </SelectTrigger>
                  <SelectContent>
                    {(pipelines.data?.pipelines ?? [])
                      .filter((pipeline) => pipeline.isActive)
                      .map((pipeline) => (
                        <SelectItem value={pipeline.id} key={pipeline.id}>
                          {pipeline.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </RecordLookupSelect>
              )}
            </div>
            <Label htmlFor="crm-deal-search" className="sr-only">
              Search loaded opportunities
            </Label>
            <Input
              id="crm-deal-search"
              type="search"
              placeholder="Search all deals by name or number"
              className="w-full sm:max-w-sm"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
            <p className="text-xs text-muted-foreground" role="status">
              Showing {filteredOpenDeals.length} deals on page {page + 1}. Pipeline and search
              filters run on the server.
            </p>
          </div>
          {opps.isLoading || pipelines.isLoading ? <LoadingState /> : null}
          {opps.isError ? (
            <QueryErrorState queries={[opps]} title="Could not load opportunities" />
          ) : null}
          {pipelines.isError ? (
            <QueryErrorState queries={[pipelines]} title="Could not load pipeline stages" />
          ) : null}
          {closedOpps.isError ? (
            <QueryErrorState queries={[closedOpps]} title="Could not load closed deals" />
          ) : null}

          {opps.isSuccess && filteredOpenDeals.length === 0 ? (
            <EmptyState
              title={searchTerm ? "No matching loaded opportunities" : "No open opportunities"}
              description={
                searchTerm ? "Try another search term." : "Create a deal or convert a lead."
              }
              action={
                !searchTerm && canManage && settings.data?.enabled ? (
                  <Button type="button" size="sm" onClick={() => setShowForm(true)}>
                    New opportunity
                  </Button>
                ) : undefined
              }
            />
          ) : null}

          {view === "list" && filteredOpenDeals.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Number</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Weighted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOpenDeals.map((opp) => {
                    const stage = stages.find((s) => s.id === opp.stageId);
                    return (
                      <TableRow key={opp.id}>
                        <TableCell>{opp.opportunityNumber}</TableCell>
                        <TableCell>{opp.name}</TableCell>
                        <TableCell>
                          <CrmStatusBadge status={stage?.name ?? "Open"} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCrmMinor(opp.amountMinor, opp.currencyCode)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCrmMinor(
                            Math.round((opp.amountMinor * opp.probabilityPct) / 100),
                            opp.currencyCode,
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : null}

          {view === "kanban" && stages.length > 0 ? (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {stages.map((stage) => {
                const column = filteredOpenDeals.filter((opp) => opp.stageId === stage.id);
                return (
                  <section
                    key={stage.id}
                    aria-label={`${stage.name} stage`}
                    className="w-72 shrink-0 rounded-xl border bg-muted/30 p-3"
                    onDragOver={(event) => {
                      if (!canManage) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(event) => {
                      if (!canManage) return;
                      event.preventDefault();
                      const raw = event.dataTransfer.getData("application/x-crm-opportunity");
                      if (!raw) return;
                      try {
                        const payload = JSON.parse(raw) as {
                          opportunityId: string;
                          expectedVersion: number;
                          fromStageId: string;
                        };
                        if (payload.fromStageId === stage.id) return;
                        moveMutation.mutate({
                          opportunityId: payload.opportunityId,
                          nextStageId: stage.id,
                          expectedVersion: payload.expectedVersion,
                        });
                      } catch {
                        /* ignore malformed drag payload */
                      }
                    }}
                  >
                    <header className="mb-3 flex items-baseline justify-between gap-2">
                      <h2 className="text-sm font-semibold">{stage.name}</h2>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {stage.probabilityPct}% · {column.length}
                      </span>
                    </header>
                    <div className="space-y-2">
                      {column.map((opp) => (
                        <article
                          key={opp.id}
                          draggable={canManage}
                          onDragStart={(event) => {
                            if (!canManage) return;
                            event.dataTransfer.setData(
                              "application/x-crm-opportunity",
                              JSON.stringify({
                                opportunityId: opp.id,
                                expectedVersion: opp.version,
                                fromStageId: opp.stageId,
                              }),
                            );
                            event.dataTransfer.effectAllowed = "move";
                          }}
                          className={cn(
                            "rounded-lg border bg-background p-3 shadow-sm",
                            "focus-within:ring-2 focus-within:ring-ring",
                            canManage ? "cursor-grab active:cursor-grabbing" : null,
                          )}
                        >
                          <p className="font-medium">{opp.name}</p>
                          <p className="text-xs text-muted-foreground">{opp.opportunityNumber}</p>
                          <p className="mt-2 text-sm tabular-nums">
                            {formatCrmMinor(opp.amountMinor, opp.currencyCode)}
                          </p>
                          {canManage ? (
                            <Label className="mt-3 block space-y-1 text-xs">
                              <span className="text-muted-foreground">Move to (keyboard)</span>
                              <RecordLookupSelect
                                value={opp.stageId}
                                onValueChange={(next) => {
                                  if (next === opp.stageId) return;
                                  moveMutation.mutate({
                                    opportunityId: opp.id,
                                    nextStageId: next,
                                    expectedVersion: opp.version,
                                  });
                                }}
                                disabled={moveMutation.isPending}
                              >
                                <SelectTrigger aria-label={`Move ${opp.name}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {stages.map((option) => (
                                    <SelectItem key={option.id} value={option.id}>
                                      {option.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </RecordLookupSelect>
                            </Label>
                          ) : null}
                        </article>
                      ))}
                      {column.length === 0 ? (
                        <p className="px-1 text-xs text-muted-foreground">Drop deals here</p>
                      ) : null}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : null}

          {opps.isSuccess && (page > 0 || hasNextPage) ? (
            <nav
              aria-label="Opportunity pages"
              className="flex flex-wrap items-center justify-between gap-3"
            >
              <p className="text-sm text-muted-foreground">
                Page {page + 1} · {filteredOpenDeals.length} deals
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={page === 0 || opps.isFetching}
                  onClick={() => setPage((value) => Math.max(0, value - 1))}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!hasNextPage || opps.isFetching}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next
                </Button>
              </div>
            </nav>
          ) : null}

          {(closedOpps.data?.some((opp) => opp.pipelineId === selectedPipeline?.id) ?? false) ? (
            <Card>
              <CardHeader>
                <CardTitle>Closed deals</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(closedOpps.data ?? [])
                  .filter((opp) => opp.pipelineId === selectedPipeline?.id)
                  .map((opp) => (
                    <div
                      key={opp.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                    >
                      <div>
                        <p className="font-medium">{opp.name}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {opp.opportunityNumber}
                          </span>
                          <CrmStatusBadge status={opp.status} />
                        </div>
                      </div>
                      {canManage ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={reopenMutation.isPending}
                          onClick={() => reopenMutation.mutate(opp.id)}
                        >
                          Reopen
                        </Button>
                      ) : null}
                    </div>
                  ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}
    </ListWorkspace>
  );
}
