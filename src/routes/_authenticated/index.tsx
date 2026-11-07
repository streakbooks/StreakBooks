import { useEffect, useRef } from "react";
import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import {
  ensureDemoSeeded,
  getDemoLedgerSnapshot,
  getDemoModuleStatus,
} from "@/lib/demo/demo.functions";
import { getDashboardSnapshot } from "@/lib/dashboard/dashboard.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { ErrorState, LoadingState, CardGridSkeleton } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { GettingStarted, KpiRow } from "@/components/dashboard/DashboardWidgets";
import { PersonalizedDashboardWidgets } from "@/components/dashboard/PersonalizedDashboardWidgets";
import { BookkeepingAttentionCentre } from "@/components/dashboard/BookkeepingAttentionCentre";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Dashboard — LinkBooks" },
      {
        name: "description",
        content: "Cash position, receivables, payables and recent activity in LinkBooks.",
      },
      { property: "og:title", content: "Dashboard — LinkBooks" },
      {
        property: "og:description",
        content: "Cash position, receivables, payables and recent activity in LinkBooks.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { user } = useRouteContext({ from: "/_authenticated" });
  const { company, isPending } = useActiveCompany();
  const companyId = company?.id ?? null;
  const isDemo = Boolean(company?.is_demo);
  const queryClient = useQueryClient();
  const fetchDashboard = useServerFn(getDashboardSnapshot);
  // The canonical demo snapshot is kept only to verify the demo dataset and to auto-seed it.
  const fetchDemoSnap = useServerFn(getDemoLedgerSnapshot);
  const fetchModules = useServerFn(getDemoModuleStatus);
  const doEnsureSeed = useServerFn(ensureDemoSeeded);
  const seedAttempted = useRef<string | null>(null);

  const dashQ = useQuery({
    queryKey: ["dashboard-snapshot", companyId],
    enabled: Boolean(companyId),
    queryFn: () => fetchDashboard({ data: { companyId: companyId! } }),
  });

  const demoSnapQ = useQuery({
    queryKey: ["ledger-snapshot", companyId],
    enabled: Boolean(companyId) && isDemo,
    queryFn: () => fetchDemoSnap({ data: { companyId: companyId! } }),
  });

  const modulesQ = useQuery({
    queryKey: ["demo-modules"],
    enabled: isDemo,
    queryFn: () => fetchModules(),
  });

  // Auto-seed Demo when its ledger is empty (previous seeds failed on period dates)
  useEffect(() => {
    if (!isDemo || !companyId || demoSnapQ.isPending || demoSnapQ.isError) return;
    if ((demoSnapQ.data?.journalLineCount ?? 0) > 0) return;
    if (seedAttempted.current === companyId) return;
    seedAttempted.current = companyId;
    void (async () => {
      try {
        const result = await doEnsureSeed({ data: { companyId } });
        if (result.seeded) {
          toast.success("Demo sample ledger seeded");
          await queryClient.invalidateQueries({ queryKey: ["ledger-snapshot", companyId] });
          await queryClient.invalidateQueries({ queryKey: ["dashboard-snapshot", companyId] });
        }
      } catch (e) {
        toast.error(friendlyAuthError(e));
      }
    })();
  }, [
    isDemo,
    companyId,
    demoSnapQ.isPending,
    demoSnapQ.isError,
    demoSnapQ.data?.journalLineCount,
    doEnsureSeed,
    queryClient,
  ]);

  if (isPending) return <LoadingState />;
  if (!companyId) {
    return (
      <ListWorkspace title="Dashboard" description="Select or create an organisation to begin.">
        <CompanyEmptyState
          title="No organisation selected"
          description="Create a company or open Demo Company from the switcher."
        />
      </ListWorkspace>
    );
  }

  const data = dashQ.data;
  const demoSnap = demoSnapQ.data;

  return (
    <ListWorkspace
      title="Financial overview"
      description={`${company?.name ?? "Your organisation"} · ${company?.base_currency ?? ""} · Balances from your posted ledger and documents.`}
      actions={
        <>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/reports">Reports</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href="#bookkeeping-attention">Review tasks</a>
          </Button>
          <Button size="sm" asChild>
            <Link to="/sales/invoices/new">New invoice</Link>
          </Button>
        </>
      }
    >
      {isDemo && demoSnapQ.isSuccess && (demoSnap?.journalLineCount ?? 0) === 0 ? (
        <Alert className="mb-6 border-warning/40 bg-warning-soft">
          <AlertTitle>Preparing demo records</AlertTitle>
          <AlertDescription>
            Sample records are being prepared. If this continues, open{" "}
            <Link
              to="/settings"
              search={{ section: "demo" }}
              className="font-medium underline underline-offset-4"
            >
              demo settings
            </Link>{" "}
            to review or reset the sample data.
          </AlertDescription>
        </Alert>
      ) : null}

      {dashQ.isPending ? (
        <div className="space-y-6">
          <CardGridSkeleton />
          <LoadingState rows={6} />
        </div>
      ) : dashQ.isError ? (
        <ErrorState
          title="Could not load the dashboard"
          description={friendlyAuthError(dashQ.error)}
          onRetry={() => void dashQ.refetch()}
        />
      ) : data ? (
        <div className="space-y-6">
          <GettingStarted data={data} />
          <KpiRow data={data} />
          <BookkeepingAttentionCentre data={data} />
          <PersonalizedDashboardWidgets data={data} companyId={companyId} userId={user.id} />
          <div className="grid gap-6 lg:grid-cols-3">
            {isDemo ? (
              <Card>
                <details>
                  <summary className="cursor-pointer rounded-xl p-5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring">
                    Demo data and module status
                  </summary>
                  <CardContent>
                    <p className="mb-3 text-xs text-muted-foreground">
                      {demoSnap?.matchesCanonicalDemoExpected
                        ? "Sample ledger totals verified."
                        : "Explore the sample organisation using the same accounting workflows as your live companies."}
                    </p>
                    {modulesQ.isPending ? <LoadingState rows={2} /> : null}
                    {modulesQ.isError ? (
                      <ErrorState
                        compact
                        title="Could not load module status"
                        onRetry={() => void modulesQ.refetch()}
                      />
                    ) : null}
                    <ul className="max-h-64 space-y-2 overflow-y-auto text-sm">
                      {(modulesQ.data?.modules ?? []).map((m) => (
                        <li key={m.path} className="flex items-start justify-between gap-2">
                          <Link className="underline-offset-2 hover:underline" to={m.path}>
                            {m.label}
                          </Link>
                          <Badge variant="outline" className="shrink-0 text-[10px]">
                            {m.status}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </details>
              </Card>
            ) : null}
          </div>
        </div>
      ) : null}
    </ListWorkspace>
  );
}
