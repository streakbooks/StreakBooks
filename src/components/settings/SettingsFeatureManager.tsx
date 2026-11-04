import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  evaluateFeatureChange,
  listOrganisationFeatures,
  setOrganisationFeature,
} from "@/lib/settings/settings-centre.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { filterFeatureSettings } from "@/lib/settings/feature-search";
import type { FeatureStateCode } from "@/lib/settings/feature-catalog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@tanstack/react-router";

const stateLabel: Record<FeatureStateCode, string> = {
  unavailable: "Unavailable",
  available_disabled: "Available · off",
  enabled_needs_config: "Enabled · needs config",
  enabled_operational: "Operational",
  restricted: "Restricted",
};

type Props = { companyId: string; canEdit: boolean };

export function SettingsFeatureManager({ companyId, canEdit }: Props) {
  const qc = useQueryClient();
  const fetch = useServerFn(listOrganisationFeatures);
  const setFeat = useServerFn(setOrganisationFeature);
  const evalChange = useServerFn(evaluateFeatureChange);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const q = useQuery({
    queryKey: ["organisation-features", companyId],
    queryFn: () => fetch({ data: { companyId } }),
  });

  const mut = useMutation({
    mutationFn: async (input: { featureKey: string; enabled: boolean }) => {
      const impact = await evalChange({
        data: { companyId, featureKey: input.featureKey, enabled: input.enabled },
      });
      if (impact.verdict === "blocked") {
        throw new Error(impact.explanation);
      }
      if (impact.verdict === "allowed_with_warnings" && impact.confirmationText) {
        const ok = window.confirm(
          `${impact.confirmationText}\n\n${impact.explanation}\n${impact.warnings.join("\n")}`,
        );
        if (!ok) throw new Error("Cancelled");
      }
      return setFeat({
        data: {
          companyId,
          featureKey: input.featureKey,
          enabled: input.enabled,
          reason: input.enabled ? "Enabled via Feature Manager" : "Disabled via Feature Manager",
        },
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["organisation-features", companyId] });
      await qc.invalidateQueries({ queryKey: ["settings-overview", companyId] });
      toast.success("Feature updated");
      setPendingKey(null);
    },
    onError: (e) => {
      if ((e as Error).message !== "Cancelled") toast.error(friendlyAuthError(e));
      setPendingKey(null);
    },
  });

  const results = filterFeatureSettings(q.data ?? [], search);

  if (q.isPending) return <Skeleton className="h-40 w-full" />;
  if (q.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Could not load features</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>{friendlyAuthError(q.error)}</p>
          <Button size="sm" variant="outline" onClick={() => void q.refetch()}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <Alert>
        <AlertTitle>Universal Feature Manager</AlertTitle>
        <AlertDescription>
          Each feature has exactly one server-computed state. Unavailable features cannot be turned
          on. Disabling dimensions preserves historical assignments.
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border bg-card p-4">
        <div className="w-full max-w-sm space-y-2">
          <Label htmlFor="feature-manager-search">Find features</Label>
          <Input
            id="feature-manager-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by feature or module…"
          />
        </div>
        <p role="status" className="text-xs text-muted-foreground">
          Showing {results.length} of {(q.data ?? []).length} features
        </p>
      </div>
      {results.length === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          No features match your search.
          <Button variant="link" onClick={() => setSearch("")}>
            Clear search
          </Button>
        </div>
      ) : null}
      <div className="grid gap-3">
        {results.map((f) => {
          const toggleable =
            canEdit &&
            f.state !== "unavailable" &&
            f.state !== "restricted" &&
            f.implementation !== "unavailable";
          return (
            <Card key={f.key}>
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 pb-2">
                <div className="min-w-0 flex-1">
                  <CardTitle className="text-base">{f.label}</CardTitle>
                  <CardDescription>{f.description}</CardDescription>
                </div>
                <Switch
                  checked={f.enabled}
                  disabled={!toggleable || pendingKey === f.key || mut.isPending}
                  onCheckedChange={(on) => {
                    setPendingKey(f.key);
                    mut.mutate({ featureKey: f.key, enabled: on });
                  }}
                  aria-label={`Toggle ${f.label}`}
                />
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant={f.state === "enabled_operational" ? "default" : "outline"}>
                  {stateLabel[f.state]}
                </Badge>
                {f.reason ? <span>{f.reason}</span> : null}
                {f.preservesHistory ? <span>History preserved on disable</span> : null}
                <span>Modules: {f.consumerModules.join(", ")}</span>
                {f.state === "enabled_needs_config" ? (
                  <Button size="sm" variant="link" className="h-auto p-0" asChild>
                    <Link
                      to="/settings"
                      search={{
                        section:
                          f.key === "late_fees"
                            ? "sales"
                            : f.key === "ai_assistant"
                              ? "automation"
                              : "products",
                      }}
                    >
                      Configure
                    </Link>
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
