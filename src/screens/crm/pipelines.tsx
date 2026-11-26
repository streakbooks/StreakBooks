import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { CrmSubnav } from "@/components/crm/CrmSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { EmptyState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  getCrmSettings,
  listCrmPipelines,
  upsertCrmPipeline,
  upsertCrmPipelineStage,
} from "@/lib/crm/crm.functions";
import { validatePipelineDraft, validatePipelineStageDraft } from "@/lib/crm/pipeline-admin";
import type { CrmPipeline, CrmPipelineStage } from "@/lib/crm/types";
import type { Permission } from "@/lib/permissions";
import { toast } from "sonner";

export function CrmPipelinesPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canView = can("crm.view" as Permission) || can("crm.admin" as Permission);
  const canAdmin = can("crm.admin" as Permission);
  const queryClient = useQueryClient();
  const fetchSettings = useServerFn(getCrmSettings);
  const fetchPipelines = useServerFn(listCrmPipelines);
  const savePipeline = useServerFn(upsertCrmPipeline);
  const saveStage = useServerFn(upsertCrmPipelineStage);

  const [newPipelineName, setNewPipelineName] = useState("");
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const [stageDraft, setStageDraft] = useState({
    name: "",
    probabilityPct: "0",
    sortOrder: "100",
    isWon: false,
    isLost: false,
    isActive: true,
  });
  const [addingForPipelineId, setAddingForPipelineId] = useState<string | null>(null);

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

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["crm-pipelines", company?.id] });
    await queryClient.invalidateQueries({ queryKey: ["crm-settings", company?.id] });
  };

  const createPipelineMutation = useMutation({
    mutationFn: async () => {
      if (!company) throw new Error("No organisation");
      const error = validatePipelineDraft({ name: newPipelineName, sortOrder: 100 });
      if (error) throw new Error(error);
      return savePipeline({
        data: {
          companyId: company.id,
          name: newPipelineName.trim(),
          description: null,
          isDefault: false,
          isActive: true,
          sortOrder: 100,
        },
      });
    },
    onSuccess: async () => {
      toast.success("Pipeline created with default stages");
      setNewPipelineName("");
      await invalidate();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (pipeline: CrmPipeline) => {
      if (!company) throw new Error("No organisation");
      return savePipeline({
        data: {
          companyId: company.id,
          id: pipeline.id,
          name: pipeline.name,
          description: pipeline.description,
          isDefault: true,
          isActive: pipeline.isActive,
          sortOrder: pipeline.sortOrder,
        },
      });
    },
    onSuccess: async () => {
      toast.success("Default pipeline updated");
      await invalidate();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const stageMutation = useMutation({
    mutationFn: async (input: {
      pipelineId: string;
      id?: string;
      name: string;
      probabilityPct: number;
      sortOrder: number;
      isWon: boolean;
      isLost: boolean;
      isActive: boolean;
    }) => {
      if (!company) throw new Error("No organisation");
      const error = validatePipelineStageDraft(input);
      if (error) throw new Error(error);
      return saveStage({
        data: {
          companyId: company.id,
          ...(input.id ? { id: input.id } : {}),
          pipelineId: input.pipelineId,
          name: input.name,
          probabilityPct: input.probabilityPct,
          sortOrder: input.sortOrder,
          isWon: input.isWon,
          isLost: input.isLost,
          isActive: input.isActive,
        },
      });
    },
    onSuccess: async () => {
      toast.success(editingStageId || addingForPipelineId ? "Stage saved" : "Stage saved");
      setEditingStageId(null);
      setAddingForPipelineId(null);
      await invalidate();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const stagesByPipeline = useMemo(() => {
    const map = new Map<string, CrmPipelineStage[]>();
    for (const stage of pipelines.data?.stages ?? []) {
      const list = map.get(stage.pipelineId) ?? [];
      list.push(stage);
      map.set(stage.pipelineId, list);
    }
    for (const [key, list] of map) {
      map.set(
        key,
        [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
      );
    }
    return map;
  }, [pipelines.data]);

  const beginEditStage = (stage: CrmPipelineStage) => {
    setAddingForPipelineId(null);
    setEditingStageId(stage.id);
    setStageDraft({
      name: stage.name,
      probabilityPct: String(stage.probabilityPct),
      sortOrder: String(stage.sortOrder),
      isWon: stage.isWon,
      isLost: stage.isLost,
      isActive: stage.isActive,
    });
  };

  const beginAddStage = (pipelineId: string) => {
    setEditingStageId(null);
    setAddingForPipelineId(pipelineId);
    const existing = stagesByPipeline.get(pipelineId) ?? [];
    const nextSort = existing.length ? Math.max(...existing.map((s) => s.sortOrder)) + 10 : 10;
    setStageDraft({
      name: "",
      probabilityPct: "25",
      sortOrder: String(nextSort),
      isWon: false,
      isLost: false,
      isActive: true,
    });
  };

  const submitStage = (pipelineId: string) => {
    stageMutation.mutate({
      pipelineId,
      ...(editingStageId ? { id: editingStageId } : {}),
      name: stageDraft.name,
      probabilityPct: Number(stageDraft.probabilityPct) || 0,
      sortOrder: Number(stageDraft.sortOrder) || 100,
      isWon: stageDraft.isWon,
      isLost: stageDraft.isLost,
      isActive: stageDraft.isActive,
    });
  };

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canView) {
    return (
      <ListWorkspace title="Pipelines" description="Sales pipelines and stages.">
        <EmptyState title="No CRM access" description="Ask an administrator for crm.view." />
      </ListWorkspace>
    );
  }

  return (
    <ListWorkspace
      title="Sales Pipelines"
      description="Configure pipelines and stage probabilities. Opportunity moves stay on the Opportunities board."
      breadcrumbs={[{ label: "CRM", to: "/crm" }, { label: "Pipelines" }]}
      subnav={<CrmSubnav current="pipelines" />}
    >
      {settings.isError ? (
        <QueryErrorState queries={[settings]} title="Could not load CRM settings" />
      ) : settings.isLoading ? (
        <LoadingState />
      ) : null}
      {settings.isSuccess && settings.data && !settings.data.enabled ? (
        <EmptyState
          title="CRM is disabled"
          description="Enable CRM to seed the default Sales pipeline."
        />
      ) : null}
      {pipelines.isLoading ? <LoadingState /> : null}
      {pipelines.isError ? (
        <QueryErrorState queries={[pipelines]} title="Could not load pipelines" />
      ) : null}

      {settings.isSuccess && settings.data?.enabled && pipelines.isSuccess ? (
        <div className="space-y-4">
          <Alert>
            <AlertTitle>Admin boundary</AlertTitle>
            <AlertDescription>
              Creating pipelines and editing stages requires crm.admin. Deactivating a stage fails
              if open opportunities still sit on it.
            </AlertDescription>
          </Alert>

          {canAdmin ? (
            <Card>
              <CardHeader>
                <CardTitle>New pipeline</CardTitle>
                <CardDescription>
                  Creates Qualification / Proposal / Won / Lost stages you can edit afterwards.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-end gap-3">
                <div className="min-w-[12rem] flex-1 space-y-2">
                  <Label htmlFor="pipeline-name">Name</Label>
                  <Input
                    id="pipeline-name"
                    value={newPipelineName}
                    onChange={(e) => setNewPipelineName(e.target.value)}
                    placeholder="Enterprise sales"
                  />
                </div>
                <Button
                  type="button"
                  disabled={createPipelineMutation.isPending || !newPipelineName.trim()}
                  onClick={() => createPipelineMutation.mutate()}
                >
                  {createPipelineMutation.isPending ? "Creating…" : "Create pipeline"}
                </Button>
              </CardContent>
            </Card>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            {(pipelines.data?.pipelines ?? []).map((pipeline) => {
              const stages = stagesByPipeline.get(pipeline.id) ?? [];
              const showEditor =
                canAdmin &&
                (editingStageId
                  ? stages.some((s) => s.id === editingStageId)
                  : addingForPipelineId === pipeline.id);
              return (
                <Card key={pipeline.id}>
                  <CardHeader>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <CardTitle>
                          {pipeline.name}
                          {pipeline.isDefault ? " (default)" : ""}
                          {!pipeline.isActive ? " · inactive" : ""}
                        </CardTitle>
                        <CardDescription>
                          {pipeline.description ?? "Pipeline stages"}
                        </CardDescription>
                      </div>
                      {canAdmin && !pipeline.isDefault && pipeline.isActive ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={setDefaultMutation.isPending}
                          onClick={() => setDefaultMutation.mutate(pipeline)}
                        >
                          Make default
                        </Button>
                      ) : null}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <ol className="space-y-2">
                      {stages.map((stage) => (
                        <li
                          key={stage.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                        >
                          <span>
                            {stage.name}
                            {stage.isWon ? " · Won" : ""}
                            {stage.isLost ? " · Lost" : ""}
                            {!stage.isActive ? " · inactive" : ""}
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="tabular-nums text-muted-foreground">
                              {stage.probabilityPct}%
                            </span>
                            {canAdmin ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => beginEditStage(stage)}
                              >
                                Edit
                              </Button>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ol>

                    {canAdmin ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => beginAddStage(pipeline.id)}
                      >
                        Add stage
                      </Button>
                    ) : null}

                    {showEditor ? (
                      <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-2 sm:col-span-2">
                            <Label htmlFor={`stage-name-${pipeline.id}`}>Stage name</Label>
                            <Input
                              id={`stage-name-${pipeline.id}`}
                              value={stageDraft.name}
                              onChange={(e) =>
                                setStageDraft((d) => ({ ...d, name: e.target.value }))
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`stage-prob-${pipeline.id}`}>Probability %</Label>
                            <Input
                              id={`stage-prob-${pipeline.id}`}
                              inputMode="numeric"
                              value={stageDraft.probabilityPct}
                              onChange={(e) =>
                                setStageDraft((d) => ({ ...d, probabilityPct: e.target.value }))
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={`stage-sort-${pipeline.id}`}>Sort order</Label>
                            <Input
                              id={`stage-sort-${pipeline.id}`}
                              inputMode="numeric"
                              value={stageDraft.sortOrder}
                              onChange={(e) =>
                                setStageDraft((d) => ({ ...d, sortOrder: e.target.value }))
                              }
                            />
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-4 text-sm">
                          <label className="flex items-center gap-2">
                            <Checkbox
                              checked={stageDraft.isWon}
                              onCheckedChange={(v) =>
                                setStageDraft((d) => ({
                                  ...d,
                                  isWon: v === true,
                                  isLost: v === true ? false : d.isLost,
                                }))
                              }
                            />
                            Won
                          </label>
                          <label className="flex items-center gap-2">
                            <Checkbox
                              checked={stageDraft.isLost}
                              onCheckedChange={(v) =>
                                setStageDraft((d) => ({
                                  ...d,
                                  isLost: v === true,
                                  isWon: v === true ? false : d.isWon,
                                }))
                              }
                            />
                            Lost
                          </label>
                          <label className="flex items-center gap-2">
                            <Checkbox
                              checked={stageDraft.isActive}
                              onCheckedChange={(v) =>
                                setStageDraft((d) => ({ ...d, isActive: v === true }))
                              }
                            />
                            Active
                          </label>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            disabled={
                              stageMutation.isPending || !pipelines.isSuccess || pipelines.isError
                            }
                            onClick={() => submitStage(pipeline.id)}
                          >
                            {stageMutation.isPending ? "Saving…" : "Save stage"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingStageId(null);
                              setAddingForPipelineId(null);
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ) : null}
    </ListWorkspace>
  );
}
