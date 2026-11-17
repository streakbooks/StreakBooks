import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { listFirmOnboardingOverview } from "@/lib/firm/firm-workflows.functions";
import { onboardingStepSummary } from "@/lib/firm/onboarding-insights";
import { getFirmClientName, type FirmClientRow } from "@/lib/firm/client-portfolio";
import { Button } from "@/components/ui/button";

export function FirmOnboardingDashboard({
  firmId,
  clients,
  onChooseClient,
}: {
  firmId: string;
  clients: FirmClientRow[];
  onChooseClient: (companyId: string) => void;
}) {
  const load = useServerFn(listFirmOnboardingOverview);
  const query = useQuery({
    queryKey: ["firm-onboarding-overview", firmId],
    queryFn: () => load({ data: { firmId } }),
    enabled: Boolean(firmId),
  });
  const today = new Date().toISOString().slice(0, 10);
  const clientNames = useMemo(
    () =>
      new Map(
        clients
          .filter((client) => Boolean(client.companies))
          .map((client) => [client.company_id, getFirmClientName(client)]),
      ),
    [clients],
  );
  const groups = useMemo(() => {
    const scoped = new Map<string, NonNullable<typeof query.data>>();
    for (const step of query.data ?? []) {
      if (!clientNames.has(step.company_id)) continue;
      const rows = scoped.get(step.company_id) ?? [];
      rows.push(step);
      scoped.set(step.company_id, rows);
    }
    return [...scoped].map(([companyId, rows]) => ({
      companyId,
      name: clientNames.get(companyId) ?? "Client organisation",
      rows,
      metrics: onboardingStepSummary(rows, today),
    }));
  }, [clientNames, query.data, today]);

  const totals = groups.reduce(
    (result, group) => {
      for (const key of [
        "total",
        "completed",
        "open",
        "overdue",
        "dueSoon",
        "blocked",
        "unassigned",
      ] as const) {
        result[key] += group.metrics[key];
      }
      return result;
    },
    { total: 0, completed: 0, open: 0, overdue: 0, dueSoon: 0, blocked: 0, unassigned: 0 },
  );
  const overdue = groups
    .flatMap((group) =>
      group.rows
        .filter((row) => !row.completed_at && row.due_date && row.due_date < today)
        .map((row) => ({
          companyId: group.companyId,
          client: group.name,
          title: row.title,
          due: row.due_date!,
        })),
    )
    .sort((a, b) => a.due.localeCompare(b.due) || a.client.localeCompare(b.client));

  return (
    <section
      className="space-y-3 rounded-lg border bg-card p-4"
      aria-label="Onboarding progress dashboard"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">Onboarding progress across accessible clients</h3>
          <p className="text-xs text-muted-foreground">
            RLS-scoped practice checklist records. Reminder dates are evaluated in UTC.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          {query.isFetching ? "Refreshing…" : "Refresh overview"}
        </Button>
      </div>
      {query.isError ? (
        <p className="text-sm text-destructive">
          The onboarding overview could not load: {friendlyAuthError(query.error)}
        </p>
      ) : query.isPending ? (
        <p className="text-sm text-muted-foreground">Loading onboarding progress…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {(
              [
                ["Completed", totals.completed, ""],
                ["Open", totals.open, ""],
                ["Overdue", totals.overdue, "text-destructive"],
                ["Due in 3 days", totals.dueSoon, ""],
                ["Blocked", totals.blocked, ""],
                ["Unassigned", totals.unassigned, ""],
              ] as const
            ).map(([label, value, cls]) => (
              <div key={label} className="rounded-md border p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`text-xl font-semibold tabular-nums ${cls}`}>{value}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {totals.total} checklist steps across {groups.length} accessible client organisations.
          </p>
          {overdue.length ? (
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Oldest overdue steps</h4>
              {overdue.slice(0, 8).map((item, index) => (
                <div
                  key={item.companyId + ":" + item.title + ":" + index}
                  className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm"
                >
                  <div className="min-w-44 flex-1">
                    <p className="font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.client} · Due {item.due}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onChooseClient(item.companyId)}
                  >
                    Open checklist
                  </Button>
                </div>
              ))}
              {overdue.length > 8 && (
                <p className="text-xs text-muted-foreground">
                  {overdue.length - 8} more overdue steps. Select a client to review its checklist.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No overdue onboarding steps in the accessible portfolio.
            </p>
          )}
        </>
      )}
    </section>
  );
}
