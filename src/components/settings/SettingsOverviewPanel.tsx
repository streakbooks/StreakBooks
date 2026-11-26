import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, CircleDashed, RefreshCcw } from "lucide-react";
import { IntegrationHealthBadge } from "@/components/settings/IntegrationHealthBadge";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { getSettingsOverview } from "@/lib/settings/settings-centre.functions";
import { resolveSettingsCategory } from "@/lib/settings/registry";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsCategoryHub } from "@/components/settings/SettingsCategoryHub";

type Props = {
  companyId: string;
  showDemo: boolean;
  filter: string;
  onFilterChange: (value: string) => void;
  onOpenSearch?: (() => void) | undefined;
};

export function SettingsOverviewPanel({
  companyId,
  showDemo,
  filter,
  onFilterChange,
  onOpenSearch,
}: Props) {
  const fetch = useServerFn(getSettingsOverview);
  const q = useQuery({
    queryKey: ["settings-overview", companyId],
    queryFn: () => fetch({ data: { companyId } }),
  });

  if (q.isPending) {
    return (
      <div aria-label="Loading Settings Centre overview" className="space-y-8">
        <SettingsCategoryHub
          currentSection="overview"
          showDemo={showDemo}
          filter={filter}
          onFilterChange={onFilterChange}
          {...(onOpenSearch ? { onOpenSearch } : {})}
        />
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-24 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (q.isError) {
    return <QueryErrorState queries={[q]} title="Could not load overview" />;
  }
  if (!q.isSuccess || !q.data) return null;

  const d = q.data;
  const counts = [
    {
      label: "Operational features",
      value: d.featureSummary.operational,
      icon: CheckCircle2,
      hint: "Enabled and ready",
    },
    {
      label: "Need configuration",
      value: d.featureSummary.needsConfig,
      icon: AlertTriangle,
      hint: "Enabled, setup incomplete",
    },
    {
      label: "Available but off",
      value: d.featureSummary.disabled,
      icon: CircleDashed,
      hint: "Optional capabilities",
    },
    {
      label: "Unavailable",
      value: d.featureSummary.unavailable,
      icon: CircleDashed,
      hint: "Not yet implemented",
    },
  ];

  return (
    <div className="space-y-8">
      <SettingsCategoryHub
        currentSection="overview"
        showDemo={showDemo}
        filter={filter}
        onFilterChange={onFilterChange}
        {...(onOpenSearch ? { onOpenSearch } : {})}
      />

      <div className="border-t pt-8">
        <h3 className="mb-4 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Setup status
        </h3>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/80 bg-gradient-to-r from-card via-card to-accent/30 px-5 py-4 shadow-xs">
        <div className="min-w-0">
          <p className="truncate font-medium">{d.company?.name ?? "Organisation"}</p>
          <p className="text-xs text-muted-foreground">
            {d.company?.base_currency ?? "Currency not configured"} · {d.memberCount} member
            {d.memberCount === 1 ? "" : "s"}
            {d.company?.is_demo ? " · Demo organisation" : ""}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={q.isFetching}
          onClick={() => void q.refetch()}
          aria-label="Refresh setup overview"
        >
          <RefreshCcw className="mr-2 size-4" aria-hidden />
          {q.isFetching ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Feature setup status">
        {counts.map((item) => (
          <Card
            key={item.label}
            className="group/metric relative overflow-hidden border-border/80 shadow-card"
          >
            <CardContent className="p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">{item.label}</span>
                <item.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </div>
              <p className="text-[1.7rem] font-bold tracking-[-0.03em] tabular-nums">
                {item.value}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{item.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {d.warnings.length > 0 ? (
        <section aria-labelledby="settings-attention-title" className="space-y-2">
          <h3 id="settings-attention-title" className="text-sm font-semibold">
            Needs attention ({d.warnings.length})
          </h3>
          {d.warnings.map((warning) => {
            const section = warning.href?.includes("section=")
              ? resolveSettingsCategory(warning.href.split("section=")[1]?.split("&")[0])
              : null;
            return (
              <Alert
                key={warning.message}
                variant={warning.severity === "high" ? "destructive" : "default"}
              >
                <AlertTitle>
                  {warning.severity === "high"
                    ? "Security or accounting integrity"
                    : warning.severity === "medium"
                      ? "Configuration"
                      : "Information"}
                </AlertTitle>
                <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                  <span>{warning.message}</span>
                  {section ? (
                    <Button size="sm" variant="outline" asChild>
                      <Link to="/settings" search={{ section }}>
                        Review
                      </Link>
                    </Button>
                  ) : null}
                </AlertDescription>
              </Alert>
            );
          })}
        </section>
      ) : null}

      {d.incompleteConfigurations.length > 0 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Configurations to finish</CardTitle>
            <CardDescription>
              Enabled features may need additional configuration before they can operate.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {d.incompleteConfigurations.map((name) => (
                <Badge key={name} variant="outline">
                  {name}
                </Badge>
              ))}
            </div>
            <Button size="sm" variant="outline" asChild>
              <Link to="/settings" search={{ section: "features" }}>
                Review Feature Manager
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid items-start gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Integration health</CardTitle>
            <CardDescription>
              Configuration status only. Delivery is not verified by configuration alone.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {d.integrations.map((integration) => (
              <div
                key={integration.name}
                className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-border/80 bg-muted/20 px-3.5 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{integration.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{integration.detail}</p>
                </div>
                <IntegrationHealthBadge status={integration.status} />
              </div>
            ))}
            {d.integrations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No integrations to show.</p>
            ) : null}
          </CardContent>
        </Card>
      </div>
      </div>
    </div>
  );
}
