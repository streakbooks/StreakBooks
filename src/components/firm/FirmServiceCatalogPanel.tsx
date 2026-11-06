import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  listFirmServiceCategories,
  saveFirmServiceCategory,
  type FirmServiceCategory,
  type FirmServiceInput,
} from "@/lib/firm/firm-catalogue.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

export function FirmServiceCatalogPanel({
  firmId,
  canManage,
}: {
  firmId: string;
  canManage: boolean;
}) {
  const list = useServerFn(listFirmServiceCategories);
  const save = useServerFn(saveFirmServiceCategory);
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<FirmServiceCategory | null>(null);
  const query = useQuery({
    queryKey: ["firm-service-categories", firmId],
    queryFn: () => list({ data: { firmId } }),
    enabled: Boolean(firmId),
  });
  const saveM = useMutation({
    mutationFn: (input: FirmServiceInput) => save({ data: input }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["firm-service-categories", firmId] });
      setName("");
      setEditing(null);
      toast.success("Firm service category saved");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const categories = query.data ?? [];

  return (
    <details className="rounded-lg border bg-card p-4">
      <summary className="cursor-pointer font-semibold">Firm service categories ({categories.length})</summary>
      <p className="mt-2 text-sm text-muted-foreground">
        Maintain reusable service names for your practice. Existing client assignments are not
        changed when a category is renamed or archived.
      </p>
      {query.isError ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span>{friendlyAuthError(query.error)}</span>
          <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      ) : query.isPending ? (
        <p className="mt-3 text-sm text-muted-foreground">Loading categories…</p>
      ) : (
        <>
          {canManage && (
            <div className="mt-4 flex flex-wrap items-end gap-2">
              <div className="min-w-52 flex-1 space-y-1">
                <Label htmlFor="firm-service-category-name">
                  {editing ? "Rename service category" : "New service category"}
                </Label>
                <Input
                  id="firm-service-category-name"
                  value={name}
                  maxLength={80}
                  placeholder="Bookkeeping, Payroll, Tax, Advisory…"
                  disabled={saveM.isPending}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <Button
                size="sm"
                disabled={!name.trim() || name.trim().length < 2 || saveM.isPending}
                onClick={() =>
                  saveM.mutate({
                    firmId,
                    ...(editing ? { id: editing.id, version: editing.version } : {}),
                    name: name.trim(),
                    is_active: editing?.is_active ?? true,
                  })
                }
              >
                {editing ? "Save name" : "Add category"}
              </Button>
              {editing && (
                <Button size="sm" variant="outline" onClick={() => { setEditing(null); setName(""); }}>
                  Cancel
                </Button>
              )}
            </div>
          )}
          <div className="mt-3 space-y-2">
            {categories.length === 0 && (
              <p className="text-sm text-muted-foreground">No custom categories yet.</p>
            )}
            {categories.map((category) => (
              <div key={category.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
                <span className="flex-1 text-sm font-medium">{category.name}</span>
                <Badge variant={category.is_active ? "secondary" : "outline"}>
                  {category.is_active ? "Active" : "Archived"}
                </Badge>
                {canManage && (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={saveM.isPending}
                      onClick={() => { setEditing(category); setName(category.name); }}
                    >
                      Rename
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={saveM.isPending}
                      onClick={() => saveM.mutate({
                        firmId,
                        id: category.id,
                        version: category.version,
                        name: category.name,
                        is_active: !category.is_active,
                      })}
                    >
                      {category.is_active ? "Archive" : "Reactivate"}
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </details>
  );
}
