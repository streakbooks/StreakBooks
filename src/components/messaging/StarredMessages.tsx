import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listStarredMessagingMessages } from "@/lib/messaging/messaging.functions";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { LoadingState, EmptyState } from "@/components/common/states";
import { SafeMessageBody } from "@/components/messaging/SafeMessageBody";
import { Button } from "@/components/ui/button";

export function StarredMessages({
  companyId,
  onOpenConversation,
}: {
  companyId: string;
  onOpenConversation: (conversationId: string) => void;
}) {
  const list = useServerFn(listStarredMessagingMessages);
  const query = useQuery({
    queryKey: ["messaging-starred-messages", companyId],
    queryFn: () => list({ data: { companyId } }),
  });

  if (query.isPending) return <LoadingState rows={3} />;
  if (query.isError) {
    return (
      <QueryErrorState queries={[query]} title="Could not load starred messages" />
    );
  }
  if (!query.isSuccess) return <LoadingState rows={3} />;
  if (!query.data?.length) {
    return (
      <EmptyState
        title="No starred messages"
        description="Star messages in a thread to collect them here."
      />
    );
  }

  return (
    <ul className="space-y-2">
      {query.data.map((message) => (
        <li key={message.id} className="rounded border bg-background px-3 py-2">
          <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>#{message.seq}</span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={() => onOpenConversation(message.conversation_id)}
            >
              Open thread
            </Button>
          </div>
          <SafeMessageBody body={message.body} />
        </li>
      ))}
    </ul>
  );
}
