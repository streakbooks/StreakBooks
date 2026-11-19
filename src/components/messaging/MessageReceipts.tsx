import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { listMessagingMessageReceipts } from "@/lib/messaging/messaging.functions";

export function MessageReceipts({
  companyId,
  messageId,
}: {
  companyId: string;
  messageId: string;
}) {
  const list = useServerFn(listMessagingMessageReceipts);
  const query = useQuery({
    queryKey: ["messaging-receipts", companyId, messageId],
    queryFn: () => list({ data: { companyId, messageId } }),
    staleTime: 30_000,
  });

  if (query.isPending) {
    return <p className="text-xs text-muted-foreground">Checking read receipts…</p>;
  }
  if (query.isError) {
    return <QueryErrorState queries={[query]} title="Could not load read receipts" />;
  }
  if (!query.data?.length) {
    return <p className="text-xs text-muted-foreground">No read receipts yet</p>;
  }

  const names = query.data
    .slice(0, 5)
    .map((row) => row.full_name)
    .join(", ");
  const extra = query.data.length > 5 ? ` +${query.data.length - 5}` : "";
  return (
    <p className="text-xs text-muted-foreground">
      Read by {names}
      {extra}
    </p>
  );
}
