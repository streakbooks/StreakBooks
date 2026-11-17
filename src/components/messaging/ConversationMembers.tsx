import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { LoadingState, ErrorState, EmptyState } from "@/components/common/states";
import {
  blockMessagingUser,
  listMessagingConversationMembers,
} from "@/lib/messaging/messaging.functions";
import { notify } from "@/lib/notify";

export function ConversationMembers({
  companyId,
  conversationId,
  currentUserId,
  allowBlock,
}: {
  companyId: string;
  conversationId: string;
  currentUserId: string | null;
  allowBlock: boolean;
}) {
  const list = useServerFn(listMessagingConversationMembers);
  const block = useServerFn(blockMessagingUser);
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["messaging-members", companyId, conversationId],
    queryFn: () => list({ data: { companyId, conversationId } }),
  });

  const blockMutation = useMutation({
    mutationFn: (blockedUserId: string) =>
      block({ data: { companyId, blockedUserId, reason: "Blocked from conversation panel" } }),
    onSuccess: () => {
      notify.success("User blocked", "New DMs with this person are prevented.");
      void client.invalidateQueries({ queryKey: ["messaging-members", companyId, conversationId] });
    },
    onError: (error) => notify.error(error, "Could not block user"),
  });

  if (query.isPending) return <LoadingState rows={2} />;
  if (query.isError) {
    return (
      <ErrorState
        title="Could not load members"
        onRetry={() => void query.refetch()}
        compact
      />
    );
  }
  if (!query.data?.length) {
    return <EmptyState title="No members" description="This conversation has no active members." />;
  }

  return (
    <ul className="space-y-2">
      {query.data.map((member) => (
        <li
          key={member.user_id}
          className="flex items-center justify-between gap-2 rounded border bg-background px-3 py-2 text-sm"
        >
          <div className="min-w-0">
            <p className="truncate font-medium">{member.full_name || member.email || member.user_id}</p>
            <p className="truncate text-xs text-muted-foreground">
              {member.role} · {member.email}
            </p>
          </div>
          {allowBlock && currentUserId && member.user_id !== currentUserId ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-destructive"
              disabled={blockMutation.isPending}
              onClick={() => blockMutation.mutate(member.user_id)}
            >
              Block
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
