import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  applyFirmCustomOnboarding,
  listFirmCustomOnboarding,
  saveFirmCustomOnboarding,
  type FirmCustomOnboardingStep,
  type FirmCustomOnboardingInput,
} from "@/lib/firm/firm-catalogue.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

export function FirmCustomOnboardingTemplates({
  firmId,
  companyId,
  canManage,
}: {
  firmId: string;
  companyId: string;
  canManage: boolean;
}) {
  const list = useServerFn(listFirmCustomOnboarding);
  const save = useServerFn(saveFirmCustomOnboarding);
  const apply = useServerFn(applyFirmCustomOnboarding);
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [editing, setEditing] = useState<FirmCustomOnboardingStep | null>(null);
  const query = useQuery({
    queryKey: ["firm-custom-onboarding-templates", firmId],
    queryFn: () => list({ data: { firmId } }),
    enabled: Boolean(firmId),
  });
  const saveM = useMutation({
    mutationFn: (data: FirmCustomOnboardingInput) => save({ data }),
    onSuccess: async () => {
      setTitle("");
      setEditing(null);
      await qc.invalidateQueries({ queryKey: ["firm-custom-onboarding-templates", firmId] });
      toast.success("Custom onboarding template saved");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const applyM = useMutation({
    mutationFn: () => apply({ data: { firmId, companyId } }),
    onSuccess: async (result) => {
      await qc.invalidateQueries({ queryKey: ["firm-onboarding-steps", firmId, companyId] });
      toast.success(`Added ${result.added} missing custom checklist steps`);
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const items = query.data ?? [];
  const activeCount = items.filter((step) => step.is_active).length;

  return (
    <details className="rounded-lg border bg-card p-4">
      <summary className="cursor-pointer font-semibold">
        Custom onboarding templates ({activeCount} active)
      </summary>
      <p className="mt-2 text-sm text-muted-foreground">
        Add reusable firm-specific checklist steps. Applying them to a client never overwrites
        completed evidence or existing steps. Archiving a template does not erase client history.
      </p>
      {query.isError ? (
        <div className="mt-3 flex items-center gap-2">
          <p className="text-sm">{friendlyAuthError(query.error)}</p>
          <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      ) : query.isPending ? (
        <p className="mt-3 text-sm text-muted-foreground">Loading custom templates…</p>
      ) : (
        <>
          {canManage && (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <div className="min-w-52 flex-1 space-y-1">
                <Label htmlFor="firm-onboarding-custom-title">
                  {editing ? "Edit custom step" : "New custom checklist step"}
                </Label>
                <Input
                  id="firm-onboarding-custom-title"
                  value={title}
                  maxLength={180}
                  disabled={saveM.isPending}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Verify payroll registration and authority"
                />
              </div>
              <Button
                size="sm"
                disabled={saveM.isPending || title.trim().length < 2}
                onClick={() => saveM.mutate({
                  firmId,
                  ...(editing ? { task_key: editing.task_key, version: editing.version } : {}),
                  title: title.trim(),
                  is_active: editing?.is_active ?? true,
                  sort_order: editing?.sort_order ?? 100,
                })}
              >
                {editing ? "Save step" : "Add step"}
              </Button>
              {editing && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setEditing(null); setTitle(""); }}
                >
                  Cancel
                </Button>
              )}
            </div>
          )}
          <div className="mt-3 space-y-2">
            {items.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No custom steps yet. Standard onboarding and offboarding remain available.
              </p>
            )}
            {items.map((step) => (
              <div
                key={step.task_key}
                className="flex flex-wrap items-center gap-2 rounded-md border p-2"
              >
                <span className="flex-1 text-sm">{step.title}</span>
                <Badge variant={step.is_active ? "secondary" : "outline"}>
                  {step.is_active ? "Active" : "Archived"}
                </Badge>
                {canManage && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={saveM.isPending}
                      onClick={() => { setEditing(step); setTitle(step.title); }}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={saveM.isPending}
                      onClick={() => saveM.mutate({
                        firmId,
                        task_key: step.task_key,
                        version: step.version,
                        title: step.title,
                        is_active: !step.is_active,
                        sort_order: step.sort_order,
                      })}
                    >
                      {step.is_active ? "Archive" : "Restore"}
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
          {canManage && (
            <Button
              className="mt-3"
              size="sm"
              variant="outline"
              disabled={applyM.isPending || !activeCount || !companyId}
              onClick={() => applyM.mutate()}
            >
              {applyM.isPending
                ? "Applying…"
                : `Add ${activeCount} active custom steps to selected client`}
            </Button>
          )}
        </>
      )}
    </details>
  );
}
