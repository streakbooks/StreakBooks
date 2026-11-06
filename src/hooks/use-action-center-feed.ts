import { useEffect } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/notify";
import type { ActionNotification } from "@/hooks/use-action-notifications";

const SELECT_FIELDS =
  "id,company_id,title,body,category,priority,target_path,entity_type,entity_id,created_at,read_at,archived_at,resolved_at";

/**
 * RLS-scoped, incrementally loaded Action Center history.
 * The notification bell continues to use its own small, cached recent-alert query.
 * Each history page has a deterministic two-column order; IDs are de-duplicated in UI.
 */
let historyChannelSequence = 0;

export function useActionCenterFeed(companyId: string | null, userId: string, batchSize = 200) {
  const client = useQueryClient();
  const feedKey = ["action-center-feed", companyId, userId, batchSize] as const;
  const inbox = useInfiniteQuery({
    queryKey: feedKey,
    enabled: Boolean(companyId && userId),
    initialPageParam: 0,
    refetchInterval: 60_000,
    queryFn: async ({ pageParam }): Promise<ActionNotification[]> => {
      if (pageParam === 0) {
        const { error: refreshError } = await supabase.rpc(
          "refresh_action_notifications" as never,
          { _company_id: companyId } as never,
        );
        if (refreshError) throw refreshError;
        const { error: followupError } = await supabase.rpc(
          "refresh_my_contact_followups" as never,
          { _company_id: companyId } as never,
        );
        if (followupError) throw followupError;
      }
      const from = pageParam * batchSize;
      const { data, error } = await supabase
        .from("action_notifications" as never)
        .select(SELECT_FIELDS as never)
        .eq("company_id" as never, companyId as never)
        .order("created_at" as never, { ascending: false })
        .order("id" as never, { ascending: false })
        .range(from, from + batchSize - 1);
      if (error) throw error;
      return (data ?? []) as unknown as ActionNotification[];
    },
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      lastPage.length === batchSize ? lastPageParam + 1 : undefined,
  });

  const unreadQuery = useQuery({
    queryKey: ["action-notifications-unread", companyId, userId],
    enabled: Boolean(companyId && userId),
    refetchInterval: 60_000,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("action_notifications" as never)
        .select("id" as never, { count: "exact", head: true })
        .eq("company_id" as never, companyId as never)
        .is("read_at" as never, null)
        .is("archived_at" as never, null)
        .is("resolved_at" as never, null);
      if (error) throw error;
      return count ?? 0;
    },
  });

  useEffect(() => {
    if (!companyId || !userId) return;
    const channel = supabase
      .channel(`action-center-history:${companyId}:${userId}:${++historyChannelSequence}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "action_notifications",
          filter: `recipient_user_id=eq.${userId}`,
        },
        () => {
          void client.invalidateQueries({ queryKey: ["action-center-feed", companyId, userId] });
          void client.invalidateQueries({ queryKey: ["action-notifications-unread", companyId, userId] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [client, companyId, userId]);

  const changeState = useMutation({
    mutationFn: async ({ id, read, archive }: { id: string; read?: boolean; archive?: boolean }) => {
      const { data, error } = await supabase.rpc(
        "set_action_notification_state" as never,
        {
          _notification_id: id,
          _mark_read: read ?? null,
          _archive: archive ?? null,
        } as never,
      );
      if (error) throw error;
      if (!data) throw new Error("Notification no longer accessible or permission was revoked");
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["action-center-feed", companyId, userId] });
      void client.invalidateQueries({ queryKey: ["action-notifications", companyId] });
      void client.invalidateQueries({ queryKey: ["action-notifications-unread", companyId, userId] });
    },
    onError: (error) => notify.error(error, "Could not update notification"),
  });

  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ["action-center-feed", companyId, userId] }),
      client.invalidateQueries({ queryKey: ["action-notifications", companyId] }),
      client.invalidateQueries({ queryKey: ["action-notifications-unread", companyId, userId] }),
    ]);

  return { inbox, unreadQuery, changeState, refresh };
}
