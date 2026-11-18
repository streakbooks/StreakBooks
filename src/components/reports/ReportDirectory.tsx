import { Link } from "@tanstack/react-router";
import { ArrowUpRight, ChevronDown, FileText } from "lucide-react";
import type { ReportDef } from "@/lib/reports/catalog";
import { REPORT_CATEGORIES } from "@/lib/reports/catalog";

/**
 * Compact, independently collapsible report categories.
 * Report links navigate to the dedicated report route and preserve the chosen period.
 */
export function ReportDirectory({
  reports,
  from,
  to,
  centre,
}: {
  reports: ReportDef[];
  from: string;
  to: string;
  centre?: string;
}) {
  const sections = REPORT_CATEGORIES.map((category) => ({
    ...category,
    rows: reports.filter((report) => report.category === category.id),
  })).filter((section) => section.rows.length > 0);

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2" aria-label="Report categories">
      {sections.map((section) => (
        <section
          key={section.id}
          aria-labelledby={`directory-${section.id}`}
          className="lb-report-directory min-w-0 overflow-hidden rounded-xl border border-border/90 bg-card shadow-card"
        >
          <details open className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border-b border-border/70 bg-muted/35 px-4 py-3.5 outline-none transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              <span className="min-w-0">
                <span id={`directory-${section.id}`} className="block font-bold tracking-[-0.01em]">
                  {section.label}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {section.rows.length} {section.rows.length === 1 ? "report" : "reports"}
                </span>
              </span>
              <ChevronDown
                className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <div className="divide-y divide-border/70">
              {section.rows.map((report) =>
                report.status === "depends" ? (
                  <div key={report.id} className="flex gap-3 px-4 py-3 opacity-65">
                    <FileText className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{report.title} · Unavailable</p>
                      <p className="text-xs text-muted-foreground">
                        {report.dependency || "Required functionality is not yet available."}
                      </p>
                    </div>
                  </div>
                ) : report.runner === "link" && report.linkTo ? (
                  <Link
                    key={report.id}
                    to={report.linkTo}
                    className="group/report flex items-start gap-3 px-4 py-3.5 transition-[background-color,box-shadow] hover:bg-accent/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <FileText
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{report.title}</span>
                      <span className="block text-xs leading-relaxed text-muted-foreground">
                        {report.description}
                      </span>
                    </span>
                    <ArrowUpRight
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </Link>
                ) : (
                  <Link
                    key={report.id}
                    to="/reports/$reportId"
                    params={{ reportId: report.id }}
                    search={{ from, to, centre }}
                    className="group/report flex items-start gap-3 px-4 py-3.5 transition-[background-color,box-shadow] hover:bg-accent/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <FileText
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{report.title}</span>
                      <span className="block text-xs leading-relaxed text-muted-foreground">
                        {report.description}
                      </span>
                    </span>
                    <ArrowUpRight
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </Link>
                ),
              )}
            </div>
          </details>
        </section>
      ))}
    </div>
  );
}
