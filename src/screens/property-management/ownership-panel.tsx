import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  listPmOwnership,
  listPmOwners,
  upsertPmOwnership,
} from "@/lib/property-management/pm.functions";
import { toast } from "sonner";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function PmOwnershipPanel({
  companyId,
  propertyId,
  propertyLabel,
  canManage,
}: {
  companyId: string;
  propertyId: string;
  propertyLabel: string;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const fetchOwnership = useServerFn(listPmOwnership);
  const fetchOwners = useServerFn(listPmOwners);
  const saveOwnership = useServerFn(upsertPmOwnership);

  const [ownerId, setOwnerId] = useState("");
  const [ownershipPct, setOwnershipPct] = useState("100");
  const [distributionPct, setDistributionPct] = useState("100");
  const [effectiveFrom, setEffectiveFrom] = useState(todayIso());
  const [showForm, setShowForm] = useState(false);

  const ownership = useQuery({
    queryKey: ["pm-ownership", companyId, propertyId],
    queryFn: () => fetchOwnership({ data: { companyId, propertyId } }),
    enabled: Boolean(companyId && propertyId),
    retry: false,
  });

  const owners = useQuery({
    queryKey: ["pm-owners", companyId, ""],
    queryFn: () => fetchOwners({ data: { companyId } }),
    enabled: Boolean(companyId) && canManage && showForm,
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      return saveOwnership({
        data: {
          companyId,
          draft: {
            propertyId,
            ownerId,
            ownershipPct: Number(ownershipPct),
            distributionPct: Number(distributionPct),
            effectiveFrom,
          },
        },
      });
    },
    onSuccess: async () => {
      toast.success("Ownership share saved");
      setShowForm(false);
      await queryClient.invalidateQueries({ queryKey: ["pm-ownership", companyId, propertyId] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const totalOpen = (ownership.data ?? [])
    .filter((row) => !row.effectiveTo || row.effectiveTo >= todayIso())
    .reduce((sum, row) => sum + Number(row.ownershipPct || 0), 0);

  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>Ownership — {propertyLabel}</CardTitle>
          <CardDescription>
            Effective-dated legal ownership and distribution percentages. When coverage rows exist,
            ownership must total 100% if the company setting requires it.
          </CardDescription>
        </div>
        {canManage ? (
          <Button type="button" size="sm" onClick={() => setShowForm((value) => !value)}>
            {showForm ? "Close" : "Add share"}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm text-muted-foreground">
          Open ownership total (heuristic):{" "}
          <span className="tabular-nums font-medium text-foreground">{totalOpen.toFixed(2)}%</span>
        </p>
        {showForm && canManage ? (
          <div className="grid gap-4 rounded-xl border border-border/70 p-4 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label>Owner</Label>
              <RecordLookupSelect value={ownerId} onValueChange={setOwnerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select owner" />
                </SelectTrigger>
                <SelectContent>
                  {(owners.data ?? []).map((owner) => (
                    <SelectItem key={owner.id} value={owner.id}>
                      {owner.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </RecordLookupSelect>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pm-own-pct">Ownership %</Label>
              <Input
                id="pm-own-pct"
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={ownershipPct}
                onChange={(event) => setOwnershipPct(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pm-dist-pct">Distribution %</Label>
              <Input
                id="pm-dist-pct"
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={distributionPct}
                onChange={(event) => setDistributionPct(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pm-own-from">Effective from</Label>
              <Input
                id="pm-own-from"
                type="date"
                value={effectiveFrom}
                onChange={(event) => setEffectiveFrom(event.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                disabled={!ownerId || mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                {mutation.isPending ? "Saving…" : "Save share"}
              </Button>
            </div>
          </div>
        ) : null}
        {ownership.isLoading ? <LoadingState /> : null}
        {ownership.isError ? (
          <ErrorState
            title="Could not load ownership"
            description={friendlyAuthError(ownership.error)}
            onRetry={() => ownership.refetch()}
          />
        ) : null}
        {ownership.data?.length === 0 ? (
          <EmptyState
            title="No ownership rows"
            description="Add at least one owner share before generating owner statements."
            action={
              canManage ? (
                <Button size="sm" type="button" onClick={() => setShowForm(true)}>
                  Add share
                </Button>
              ) : undefined
            }
          />
        ) : null}
        {ownership.data && ownership.data.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="min-w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Owner</th>
                  <th className="px-3 py-2 font-medium">Ownership %</th>
                  <th className="px-3 py-2 font-medium">Distribution %</th>
                  <th className="px-3 py-2 font-medium">From</th>
                  <th className="px-3 py-2 font-medium">To</th>
                </tr>
              </thead>
              <tbody>
                {ownership.data.map((row) => (
                  <tr key={row.id} className="border-t border-border/70">
                    <td className="px-3 py-2">{row.ownerDisplayName ?? row.ownerId}</td>
                    <td className="px-3 py-2 tabular-nums">{row.ownershipPct}</td>
                    <td className="px-3 py-2 tabular-nums">{row.distributionPct}</td>
                    <td className="px-3 py-2 tabular-nums">{row.effectiveFrom}</td>
                    <td className="px-3 py-2 tabular-nums">{row.effectiveTo ?? "open"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
