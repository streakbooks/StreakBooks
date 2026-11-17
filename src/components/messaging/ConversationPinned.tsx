import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listPinnedMessagingMessages } from "@/lib/messaging/messaging.functions";
import { LoadingState, EmptyState, ErrorState } from "@/components/common/states";

export function ConversationPinned({
  companyId,
  conversationId,
}: {
  companyId: string;
  conversationId: string;
}) {
  const list = useServerFn(listPinnedMessagingMessages);
  const query = useQuery({
    queryKey: ["messaging-pinned", companyId, conversationId],
    queryFn: () => list({ data: { companyId, conversationId } }),
  });

  if (query.isPending) return <LoadingState rows={2} />;
  if (query.isError) {
    return (
      <ErrorState
        title="Could not load pinned messages"
        onRetry={() => void query.refetch()}
        compact
      />
    );
  }
  if (!query.data?.length) {
    return (
      <EmptyState
        title="No pinned messages"
        description="Pin important messages to keep them visible in this thread."
      />
    );
  }

  return (
    <ul className="space-y-2">
      {query.data.map((message) => (
        <li key={message.id} className="rounded border bg-background px-3 py-2 text-sm">
          <p className="text-xs text-muted-foreground">
            #{message.seq} · {new Date(message.created_at).toLocaleString()}
          </p>
          <p className="whitespace-pre-wrap">{message.body}</p>
        </li>
      ))}
    </ul>
  );
}
