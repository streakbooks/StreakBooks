import { Link } from "@tanstack/react-router";
import type { ReportDef } from "@/lib/reports/catalog";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import type { ReportingCentreContext } from "@/lib/reports/centre-return";
import { Button } from "@/components/ui/button";

/** Reports that already exist as a dedicated screen elsewhere: one click through, no fake runner. */
export function ReportShellFallbackLink({
  report,
  backSearch,
}: {
  report: ReportDef;
  backSearch: ReportingCentreContext;
}) {
  if (!report.linkTo) return null;
  return (
    <ListWorkspace
      title={report.title}
      description={report.description}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to={report.linkTo}>Open</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/reports" search={backSearch}>Back to Reports Centre</Link>
          </Button>
        </div>
      }
    >
      <></>
    </ListWorkspace>
  );
}
