import { ReportActivityList, type Visit } from "./ReportActivityList";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getReportActivity } from "@/lib/reports/ecosystem.functions";
import { useFormat } from "@/hooks/use-format";
import { friendlyAuthError } from "@/lib/auth-helpers";
export function ReportActivityHome({ companyId }: { companyId: string }) {
  const fetch = useServerFn(getReportActivity),
    fmt = useFormat();
  const activity = useQuery({
    queryKey: ["report-activity", companyId],
    queryFn: async () =>
      JSON.parse(await fetch({ data: { companyId } })) as { recent: Visit[]; frequent: Visit[] },
  });
  if (activity.isPending)
    return <p className="text-sm text-muted-foreground">Loading your report activity…</p>;
  if (activity.isError)
    return (
      <p role="alert" className="text-sm text-destructive">
        Could not load report activity: {friendlyAuthError(activity.error)}
      </p>
    );
  return <ReportActivityList activity={activity.data} fmt={fmt} />;
}
