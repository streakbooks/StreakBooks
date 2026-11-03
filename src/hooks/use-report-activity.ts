import { parseReportSearch, type ReportSearch } from "@/lib/reports/search";
import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { recordReportOpen } from "@/lib/reports/ecosystem.functions";
import { isReportDate } from "@/lib/reports/date-validation";
/** One server-idempotent navigation event; filter/period changes create distinct report visits. */
export function useReportActivity(
  companyId: string,
  reportId: string | undefined,
  viewId: string | undefined,
  from: string,
  to: string,
  search: ReportSearch = {},
) {
  const record = useServerFn(recordReportOpen),
    client = useQueryClient();
  const filterKey = JSON.stringify(parseReportSearch(search));
  const last = useRef<{ key: string; sent: boolean; id: string } | null>(null);
  useEffect(() => {
    if (!reportId || !isReportDate(from) || !isReportDate(to) || from > to) return;
    const key = [companyId, reportId, viewId, from, to, filterKey].join(":");
    if (last.current?.key === key && last.current.sent) return;
    last.current = { key, sent: true, id: crypto.randomUUID() };
    void record({
      data: {
        companyId,
        reportId,
        ...(viewId ? { viewId } : {}),
        eventId: last.current.id,
        search: JSON.parse(filterKey) as Record<string, unknown>,
        from,
        to,
      },
    })
      .then((inserted) => {
        if (inserted) void client.invalidateQueries({ queryKey: ["report-activity", companyId] });
      })
      .catch(() => console.warn("Report activity could not be recorded."));
  }, [companyId, reportId, viewId, from, to, filterKey, record, client]);
}
