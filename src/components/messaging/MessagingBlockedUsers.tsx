import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { LoadingState, ErrorState, EmptyState } from "@/components/common/states";
import {
  listBlockedMessagingUsers,
  unblockMessagingUser,
} from "@/lib/messaging/messaging.functions";
import { notify } from "@/lib/notify";

export function MessagingBlockedUsers({ companyId }: { companyId: string | null }) {
  const list = useServerFn(listBlockedMessagingUsers);
  const unblock = useServerFn(unblockMessagingUser);
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["messaging-blocks", companyId],
    enabled: Boolean(companyId),
    queryFn: () => list({ data: { companyId: companyId! } }),
  });

  const mutation = useMutation({
    mutationFn: (blockedUserId: string) =>
      unblock({ data: { companyId: companyId!, blockedUserId } }),
    onSuccess: () => {
      notify.success("User unblocked");
      void client.invalidateQueries({ queryKey: ["messaging-blocks", companyId] });
    },
    onError: (error) => notify.error(error, "Could not unblock user"),
  });

  if (!companyId) return null;
  if (query.isPending) return <LoadingState rows={2} />;
  if (query.isError) {
    return <ErrorState title="Could not load blocked users" onRetry={() => void query.refetch()} />;
  }

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div>
        <h3 className="text-base font-semibold">Blocked people</h3>
        <p className="text-sm text-muted-foreground">
          Blocks prevent new direct messages. Existing threads stay visible until you leave them.
        </p>
      </div>
      {!query.data?.length ? (
        <EmptyState title="No blocked people" description="Blocked users will appear here." />
      ) : (
        <ul className="space-y-2">
          {query.data.map((row) => (
            <li
              key={row.blocked_user_id}
              className="flex items-center justify-between gap-2 rounded border px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{row.full_name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {row.email || row.blocked_user_id}
                  {row.reason ? ` · ${row.reason}` : ""}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate(row.blocked_user_id)}
              >
                Unblock
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
