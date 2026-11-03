import { ReportActivityHome } from "./ReportActivityHome";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getReportingWorkspace } from "@/lib/reports/ecosystem.functions";
import { listReportLibrary } from "@/lib/reports/report-views.functions";
import { parseReportSearch } from "@/lib/reports/search";
import { QUICK_REPORT_IDS, getReportById } from "@/lib/reports/catalog";
import type { ReportingPack } from "@/lib/reports/ecosystem-model";
import { Button } from "@/components/ui/button";
import { LoadingState, ErrorState } from "@/components/common/states";
import { friendlyAuthError } from "@/lib/auth-helpers";
export function ReportingHome({
  companyId,
  from,
  to,
}: {
  companyId: string;
  from: string;
  to: string;
}) {
  const list = useServerFn(getReportingWorkspace),
    favourites = useServerFn(listReportLibrary);
  const q = useQuery({
    queryKey: ["reporting-workspace", companyId],
    queryFn: async () =>
      JSON.parse(await list({ data: { companyId } })) as {
        packs: ReportingPack[];
        schedules: Array<Record<string, unknown>>;
        deliveries: Array<Record<string, unknown>>;
        userId: string;
        packCounts: Record<string, number>;
      },
  });
  const saved = useQuery({
    queryKey: ["report-home-favourites", companyId],
    queryFn: () => favourites({ data: { companyId, favourite: true, state: "active", page: 0 } }),
  });
  if (q.isPending) return <LoadingState />;
  if (q.isError)
    return (
      <ErrorState
        title="Could not load reporting home"
        description={friendlyAuthError(q.error)}
        onRetry={() => void q.refetch()}
      />
    );
  const counts = q.data.packCounts;
  const count = (...states: string[]) => states.reduce((n, state) => n + (counts[state] ?? 0), 0);
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-medium text-muted-foreground">YOUR REPORTING WORKSPACE</p>
        <h2 className="mt-1 text-2xl font-semibold">
          From accounting records to informed decisions
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Run financial statements, reuse custom views and prepare independently reviewed management
          reports.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            title: "Drafts to prepare",
            count: count("draft", "in_progress", "review_required"),
            tab: "drafts",
          },
          { title: "Awaiting review", count: count("ready_for_review"), tab: "drafts" },
          { title: "Published packs", count: count("published", "delivered"), tab: "published" },
          {
            title: "Enabled schedules",
            count: counts["enabled_schedules"] ?? 0,
            tab: "schedules",
          },
        ].map((item) => (
          <Link
            key={item.title}
            to="/reports"
            search={{ tab: item.tab as "drafts" | "published" | "schedules", from, to }}
            className="rounded-lg border p-4 text-left transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring"
          >
            <span className="text-sm text-muted-foreground">{item.title}</span>
            <strong className="mt-2 block text-3xl">{item.count}</strong>
          </Link>
        ))}
      </div>
      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Financial reporting shortcuts</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_REPORT_IDS.map((id) => {
            const r = getReportById(id)!;
            return (
              <Link
                key={id}
                to="/reports/$reportId"
                params={{ reportId: id }}
                search={{ from, to }}
                className="rounded border p-4 hover:bg-muted/30"
              >
                <h4 className="font-semibold">{r.title}</h4>
                <p className="mt-1 text-sm text-muted-foreground">{r.description}</p>
              </Link>
            );
          })}
        </div>
      </section>
      <section className="space-y-3">
        <div className="flex justify-between">
          <h3 className="text-lg font-semibold">Favourite saved reports</h3>
          <Button size="sm" variant="ghost" asChild>
            <Link to="/reports" search={{ tab: "custom", from, to }}>
              Open custom library
            </Link>
          </Button>
        </div>
        {saved.isPending ? (
          <p className="text-sm text-muted-foreground">Loading favourites…</p>
        ) : saved.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {friendlyAuthError(saved.error)}
          </p>
        ) : !saved.data.rows.length ? (
          <p className="text-sm text-muted-foreground">Star a saved report to keep it here.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {saved.data.rows.map((r) => {
              const config = JSON.parse(r.config_json) as Record<string, unknown>;
              return config["_builder"] ? (
                <Link
                  key={r.id}
                  to="/reports/builder/$viewId"
                  params={{ viewId: r.id }}
                  className="rounded border p-3 text-sm hover:bg-muted/30"
                >
                  ★ {r.name}
                </Link>
              ) : (
                <Link
                  key={r.id}
                  to="/reports/$reportId"
                  params={{ reportId: r.report_id }}
                  search={parseReportSearch(config)}
                  className="rounded border p-3 text-sm hover:bg-muted/30"
                >
                  ★ {r.name}
                </Link>
              );
            })}
          </div>
        )}
      </section>
      <ReportActivityHome companyId={companyId} />
      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Recent pack activity</h3>
        {q.data.packs.slice(0, 5).map((p) => (
          <Link
            key={p.id}
            to="/reports"
            search={{ tab: "packs", pack: p.id, from, to }}
            className="flex flex-wrap justify-between gap-2 rounded border p-3 text-sm underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
          >
            <span>{p.name}</span>
            <span className="text-muted-foreground">
              {p.status.replaceAll("_", " ")} · {p.updated_at}
            </span>
          </Link>
        ))}
        {!q.data.packs.length && (
          <p className="text-sm text-muted-foreground">
            Reporting activity will appear as you prepare and review report packs.
          </p>
        )}
      </section>
    </div>
  );
}
