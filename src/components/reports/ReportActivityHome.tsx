import { ReportActivityList, type Visit } from "./ReportActivityList";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getReportActivity } from "@/lib/reports/ecosystem.functions";
import { useFormat } from "@/hooks/use-format";
import { QueryErrorState } from "@/components/common/QueryErrorState";
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
    return <QueryErrorState queries={[activity]} title="Could not load report activity" />;
  if (!activity.isSuccess || !activity.data)
    return <p className="text-sm text-muted-foreground">Loading your report activity…</p>;
  return <ReportActivityList activity={activity.data} fmt={fmt} />;
}
