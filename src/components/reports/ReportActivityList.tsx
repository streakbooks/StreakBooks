import { Link } from "@tanstack/react-router";
import { parseReportSearch } from "@/lib/reports/search";
import { getReportById } from "@/lib/reports/catalog";
export type Visit = {
  key: string;
  reportId: string;
  viewId: string | null;
  name: string | null;
  builder: boolean;
  from: string;
  to: string;
  openedAt: string;
  opens: number;
  search?: Record<string, unknown>;
};
export function ReportActivityList({
  activity,
  fmt,
}: {
  activity: { recent: Visit[]; frequent: Visit[] };
  fmt: { date: (value: string) => string; dateTime: (value: string) => string };
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {(["recent", "frequent"] as const).map((kind) => (
        <section key={kind} className="space-y-3">
          <h3 className="text-lg font-semibold">
            {kind === "recent" ? "Recently opened reports" : "Frequently used reports"}
          </h3>
          {activity[kind].length ? (
            <div className="space-y-2">
              {activity[kind].map((visit) => {
                const report = getReportById(visit.reportId);
                if (!report) return null;
                const body = (
                  <>
                    <span className="font-medium">{visit.name ?? report.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {kind === "recent"
                        ? fmt.dateTime(visit.openedAt)
                        : `${visit.opens} ${visit.opens === 1 ? "open" : "opens"}`}{" "}
                      · {fmt.date(visit.from)} – {fmt.date(visit.to)}
                    </span>
                  </>
                );
                return visit.builder && visit.viewId ? (
                  <Link
                    key={visit.key}
                    to="/reports/builder/$viewId"
                    params={{ viewId: visit.viewId }}
                    search={{ from: visit.from, to: visit.to }}
                    className="block rounded border p-3 text-sm hover:bg-muted/30"
                  >
                    {body}
                  </Link>
                ) : (
                  <Link
                    key={visit.key}
                    to="/reports/$reportId"
                    params={{ reportId: visit.reportId }}
                    search={{
                      ...parseReportSearch(visit.search ?? {}),
                      from: visit.from,
                      to: visit.to,
                    }}
                    className="block rounded border p-3 text-sm hover:bg-muted/30"
                  >
                    {body}
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Open a financial or saved custom report to build your own activity history.
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
