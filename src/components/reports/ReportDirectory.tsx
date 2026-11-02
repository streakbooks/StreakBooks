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
}: {
  reports: ReportDef[];
  from: string;
  to: string;
}) {
  const sections = REPORT_CATEGORIES
    .map((category) => ({
      ...category,
      rows: reports.filter((report) => report.category === category.id),
    }))
    .filter((section) => section.rows.length > 0);

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      {sections.map((section) => (
        <section
          key={section.id}
          aria-labelledby={`directory-${section.id}`}
          className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-xs"
        >
          <details open className="group">
            <summary
              className="flex cursor-pointer list-none items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3 focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden"
            >
              <span className="min-w-0">
                <span id={`directory-${section.id}`} className="block font-semibold">
                  {section.label}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {section.rows.length} {section.rows.length === 1 ? "report" : "reports"}
                </span>
              </span>
              <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
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
                    className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{report.title}</span>
                      <span className="block text-xs leading-relaxed text-muted-foreground">{report.description}</span>
                    </span>
                    <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </Link>
                ) : (
                  <Link
                    key={report.id}
                    to="/reports/$reportId"
                    params={{ reportId: report.id }}
                    search={{ from, to }}
                    className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{report.title}</span>
                      <span className="block text-xs leading-relaxed text-muted-foreground">{report.description}</span>
                    </span>
                    <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
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
