import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { CrmSubnav } from "@/components/crm/CrmSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
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
  getCrmSettings,
  listCrmOpportunities,
  listCrmPipelines,
  setCrmOpportunityStage,
  upsertCrmOpportunity,
} from "@/lib/crm/crm.functions";
import { formatCrmMinor } from "@/lib/crm/format";
import type { Permission } from "@/lib/permissions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function CrmOpportunitiesPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canView = can("crm.view" as Permission) || can("crm.admin" as Permission);
  const canManage = can("crm.opportunities.manage" as Permission);
  const queryClient = useQueryClient();
  const fetchSettings = useServerFn(getCrmSettings);
  const fetchOpps = useServerFn(listCrmOpportunities);
  const fetchPipelines = useServerFn(listCrmPipelines);
  const createOpp = useServerFn(upsertCrmOpportunity);
  const moveStage = useServerFn(setCrmOpportunityStage);

  const [view, setView] = useState<"list" | "kanban">("kanban");
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [amountMajor, setAmountMajor] = useState("");
  const [stageId, setStageId] = useState("");

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

  const opps = useQuery({
    queryKey: ["crm-opportunities", company?.id],
    queryFn: () => fetchOpps({ data: { companyId: company!.id, status: "open" } }),
    enabled: Boolean(company?.id) && canView && settings.data?.enabled === true,
    retry: false,
  });

  const defaultPipeline = useMemo(() => {
    const list = pipelines.data?.pipelines ?? [];
    return list.find((p) => p.isDefault) ?? list[0] ?? null;
  }, [pipelines.data]);

  const stages = useMemo(() => {
    if (!defaultPipeline) return [];
    return (pipelines.data?.stages ?? [])
      .filter((s) => s.pipelineId === defaultPipeline.id && s.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [pipelines.data, defaultPipeline]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!company) throw new Error("No organisation");
      const initialStageId = stageId || stages.find((s) => !s.isWon && !s.isLost)?.id;
      return createOpp({
        data: {
          companyId: company.id,
          name,
          ...(defaultPipeline?.id ? { pipelineId: defaultPipeline.id } : {}),
          ...(initialStageId ? { stageId: initialStageId } : {}),
          amountMinor: Math.max(0, Math.round((Number(amountMajor) || 0) * 100)),
          currencyCode: company.base_currency,
        },
      });
    },
    onSuccess: async () => {
      toast.success("Opportunity created");
      setShowForm(false);
      setName("");
      setAmountMajor("");
      setStageId("");
      await queryClient.invalidateQueries({ queryKey: ["crm-opportunities", company?.id] });
      await queryClient.invalidateQueries({ queryKey: ["crm-dashboard-kpis", company?.id] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const moveMutation = useMutation({
    mutationFn: async (input: { opportunityId: string; nextStageId: string }) => {
      if (!company) throw new Error("No organisation");
      return moveStage({
        data: {
          companyId: company.id,
          opportunityId: input.opportunityId,
          stageId: input.nextStageId,
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
    >
      <CrmSubnav current="opportunities" />

      {settings.data && !settings.data.enabled ? (
        <EmptyState
          title="CRM is disabled"
          description="Enable CRM before creating opportunities."
          action={
            can("crm.admin" as Permission) ? (
              <Button asChild>
                <Link to="/crm/$section" params={{ section: "settings" }}>CRM Settings</Link>
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
                  <Label>Stage</Label>
                  <Select value={stageId || "__default"} onValueChange={(v) => setStageId(v === "__default" ? "" : v)}>
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
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Button
                    type="button"
                    disabled={createMutation.isPending || !name.trim()}
                    onClick={() => createMutation.mutate()}
                  >
                    {createMutation.isPending ? "Saving…" : "Create opportunity"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {opps.isLoading || pipelines.isLoading ? <LoadingState /> : null}
          {opps.isError ? (
            <ErrorState
              title="Could not load opportunities"
              description={friendlyAuthError(opps.error)}
             onRetry={() => opps.refetch()}/>
          ) : null}

          {opps.isSuccess && (opps.data?.length ?? 0) === 0 ? (
            <EmptyState title="No open opportunities" description="Create a deal or convert a lead." />
          ) : null}

          {view === "list" && (opps.data?.length ?? 0) > 0 ? (
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
                  {(opps.data ?? []).map((opp) => {
                    const stage = stages.find((s) => s.id === opp.stageId);
                    return (
                      <TableRow key={opp.id}>
                        <TableCell>{opp.opportunityNumber}</TableCell>
                        <TableCell>{opp.name}</TableCell>
                        <TableCell>{stage?.name ?? opp.stageId.slice(0, 8)}</TableCell>
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
                const column = (opps.data ?? []).filter((opp) => opp.stageId === stage.id);
                return (
                  <section
                    key={stage.id}
                    aria-label={`${stage.name} stage`}
                    className="w-72 shrink-0 rounded-xl border bg-muted/30 p-3"
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
                          className={cn(
                            "rounded-lg border bg-background p-3 shadow-sm",
                            "focus-within:ring-2 focus-within:ring-ring",
                          )}
                        >
                          <p className="font-medium">{opp.name}</p>
                          <p className="text-xs text-muted-foreground">{opp.opportunityNumber}</p>
                          <p className="mt-2 text-sm tabular-nums">
                            {formatCrmMinor(opp.amountMinor, opp.currencyCode)}
                          </p>
                          {canManage ? (
                            <Label className="mt-3 block space-y-1 text-xs">
                              <span className="text-muted-foreground">Move to</span>
                              <Select
                                value={opp.stageId}
                                onValueChange={(next) => {
                                  if (next === opp.stageId) return;
                                  moveMutation.mutate({
                                    opportunityId: opp.id,
                                    nextStageId: next,
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
                              </Select>
                            </Label>
                          ) : null}
                        </article>
                      ))}
                      {column.length === 0 ? (
                        <p className="px-1 text-xs text-muted-foreground">No deals</p>
                      ) : null}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </ListWorkspace>
  );
}
