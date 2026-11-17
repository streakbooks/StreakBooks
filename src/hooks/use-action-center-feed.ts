import { useEffect } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type Query,
} from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/notify";
import type { ActionNotification } from "@/hooks/use-action-notifications";
import {
  actionNotificationSearchPattern,
  type ActionCenterFilters,
} from "@/lib/notifications/notification-utils";
import {
  nextNotificationCursor,
  notificationCursorFilter,
  notificationPageCountMode,
  type NotificationCursor,
} from "@/lib/notifications/notification-cursor";

const SELECT_FIELDS =
  "id,company_id,title,body,category,priority,priority_rank,target_path,entity_type,entity_id,created_at,read_at,archived_at,resolved_at";
const SERVER_PAGE_SIZE = 100;

type RankedActionNotification = ActionNotification & { priority_rank: number };
type NotificationPage = {
  rows: RankedActionNotification[];
  total: number;
  nextCursor: NotificationCursor | null;
};
type WorkloadRow = {
  action_count: number | string;
  unread_count: number | string;
  critical_count: number | string;
  completed_count: number | string;
  archived_count: number | string;
};
let historyChannelSequence = 0;

/** Server-wide, recipient-RLS-protected filters and sorting before pagination. */
export function useActionCenterFeed(
  companyId: string | null,
  userId: string,
  filters: ActionCenterFilters,
) {
  const client = useQueryClient();
  const { view, category, priority, search, sort } = filters;
  const needle = search.trim();
  const feedKey = [
    "action-center-feed",
    companyId,
    userId,
    view,
    category,
    priority,
    needle.toLocaleLowerCase(),
    sort,
  ] as const;

  const inbox = useInfiniteQuery<
    NotificationPage,
    Error,
    InfiniteData<NotificationPage, NotificationCursor | null>,
    typeof feedKey,
    NotificationCursor | null
  >({
    queryKey: feedKey,
    enabled: Boolean(companyId && userId),
    initialPageParam: null as NotificationCursor | null,
    // Avoid polling every historical page once the user has loaded several.
    // Realtime invalidation and the explicit Refresh button remain available.
    refetchInterval: (
      query: Query<
        NotificationPage,
        Error,
        InfiniteData<NotificationPage, NotificationCursor | null>,
        typeof feedKey
      >,
    ) => ((query.state.data?.pages.length ?? 0) > 1 ? false : 60_000),
    queryFn: async ({ pageParam }): Promise<NotificationPage> => {
      if (pageParam === null) {
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
        const { error: hrError } = await supabase.rpc(
          "refresh_my_hr_notifications" as never,
          { _company_id: companyId } as never,
        );
        if (hrError) throw hrError;
      }

      const countMode = notificationPageCountMode(pageParam);
      let query = supabase
        .from("action_notification_inbox" as never)
        .select(SELECT_FIELDS as never, countMode ? { count: countMode } : {})
        .eq("company_id" as never, companyId as never);

      if (category !== "all") query = query.eq("category" as never, category as never);
      if (priority !== "all") query = query.eq("priority" as never, priority as never);
      if (needle) {
        query = query.ilike(
          "search_text" as never,
          actionNotificationSearchPattern(needle) as never,
        );
      }

      switch (view) {
        case "unread":
          query = query
            .is("read_at" as never, null)
            .is("archived_at" as never, null)
            .is("resolved_at" as never, null);
          break;
        case "action":
          query = query.is("archived_at" as never, null).is("resolved_at" as never, null);
          break;
        case "critical":
          query = query
            .eq("priority" as never, "critical" as never)
            .is("archived_at" as never, null)
            .is("resolved_at" as never, null);
          break;
        case "completed":
          query = query.is("archived_at" as never, null).not("resolved_at" as never, "is", null);
          break;
        case "archived":
          query = query.not("archived_at" as never, "is", null);
          break;
        case "all":
          break;
      }

      if (pageParam) {
        query = query.or(notificationCursorFilter(pageParam, sort));
      }

      if (sort === "priority") {
        query = query
          .order("priority_rank" as never, { ascending: true })
          .order("created_at" as never, { ascending: false })
          .order("id" as never, { ascending: false });
      } else {
        const ascending = sort === "oldest";
        query = query
          .order("created_at" as never, { ascending })
          .order("id" as never, { ascending });
      }

      // One extra row provides an accurate next-page signal without offsets.
      const { data, count, error } = await query.limit(SERVER_PAGE_SIZE + 1);
      if (error) throw error;
      const received = (data ?? []) as unknown as RankedActionNotification[];
      return {
        rows: received.slice(0, SERVER_PAGE_SIZE),
        // Exact totals are requested only on the first page.
        total: count ?? 0,
        nextCursor: nextNotificationCursor(received, SERVER_PAGE_SIZE),
      };
    },
    getNextPageParam: (lastPage: NotificationPage) => lastPage.nextCursor ?? undefined,
  });

  const workload = useQuery({
    queryKey: ["action-center-summary", companyId, userId],
    enabled: Boolean(companyId && userId) && inbox.isSuccess,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "action_notification_workload" as never,
        { _company_id: companyId } as never,
      );
      if (error) throw error;
      const row = ((data ?? []) as unknown as WorkloadRow[])[0];
      if (!row) throw new Error("Could not load Action Center workload");
      return {
        action: Number(row.action_count),
        unread: Number(row.unread_count),
        critical: Number(row.critical_count),
        completed: Number(row.completed_count),
        archived: Number(row.archived_count),
      };
    },
  });

  const unreadQuery = useQuery({
    queryKey: ["action-notifications-unread", companyId, userId],
    enabled: Boolean(companyId && userId) && inbox.isSuccess,
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
      .channel("action-center-history:" + companyId + ":" + userId + ":" + ++historyChannelSequence)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "action_notifications",
          filter: "recipient_user_id=eq." + userId,
        },
        () => {
          void client.invalidateQueries({ queryKey: ["action-center-feed", companyId, userId] });
          void client.invalidateQueries({ queryKey: ["action-center-summary", companyId, userId] });
          void client.invalidateQueries({ queryKey: ["action-notifications-unread", companyId, userId] });
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
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
      void client.invalidateQueries({ queryKey: ["action-center-feed", companyId] });
      void client.invalidateQueries({ queryKey: ["action-center-summary", companyId] });
      void client.invalidateQueries({ queryKey: ["action-notifications", companyId] });
      void client.invalidateQueries({ queryKey: ["action-notifications-unread", companyId] });
    },
    onError: (error) => notify.error(error, "Could not update notification"),
  });

  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ["action-center-feed", companyId] }),
      client.invalidateQueries({ queryKey: ["action-center-summary", companyId] }),
      client.invalidateQueries({ queryKey: ["action-notifications", companyId] }),
      client.invalidateQueries({ queryKey: ["action-notifications-unread", companyId] }),
    ]);

  return { inbox, workload, unreadQuery, changeState, refresh };
}
