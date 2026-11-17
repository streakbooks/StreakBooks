import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMessagingAnalyticsSummary } from "@/lib/messaging/messaging.functions";
import { LoadingState, ErrorState } from "@/components/common/states";
import { useCanDo } from "@/hooks/use-can";

export function MessagingAnalyticsPanel({ companyId }: { companyId: string | null }) {
  const canManage = useCanDo("messaging.manage_settings");
  const fetchSummary = useServerFn(getMessagingAnalyticsSummary);
  const query = useQuery({
    queryKey: ["messaging-analytics", companyId],
    enabled: Boolean(companyId && canManage),
    queryFn: () => fetchSummary({ data: { companyId: companyId!, days: 14 } }),
  });

  if (!companyId || !canManage) {
    return (
      <p className="text-sm text-muted-foreground">
        Messaging analytics require messaging.manage_settings.
      </p>
    );
  }
  if (query.isPending) return <LoadingState rows={3} />;
  if (query.isError) {
    return (
      <ErrorState title="Could not load messaging analytics" onRetry={() => void query.refetch()} />
    );
  }

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div>
        <h3 className="text-base font-semibold">Messaging analytics</h3>
        <p className="text-sm text-muted-foreground">{query.data.note}</p>
      </div>
      <p className="text-sm">
        Last {query.data.days} days: <strong>{query.data.totalMessages}</strong> messages (excluding
        HR/private).
      </p>
      <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
        {query.data.volume.map((point) => (
          <li key={point.day} className="flex justify-between gap-3 border-b py-1">
            <span>{point.day}</span>
            <span className="text-muted-foreground">
              {point.messageCount} msgs · {point.conversationCount} threads
            </span>
          </li>
        ))}
        {!query.data.volume.length ? (
          <li className="text-muted-foreground">No volume in this window.</li>
        ) : null}
      </ul>
    </div>
  );
}
