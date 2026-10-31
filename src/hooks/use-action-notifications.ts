import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/notify";

export type ActionCategory =
  | "bill_approval" | "overdue_invoice" | "bank_reconciliation"
  | "document_request" | "system";
export type ActionPriority = "low" | "medium" | "high" | "critical";
export type ActionNotification = {
  id: string;
  company_id: string;
  title: string;
  body: string;
  category: ActionCategory;
  priority: ActionPriority;
  target_path: string | null;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
  read_at: string | null;
  archived_at: string | null;
  resolved_at: string | null;
};

export const notificationQueryKey = (companyId: string | null, limit = 100) =>
  ["action-notifications", companyId, limit] as const;

export { safeNotificationPath } from "@/lib/notifications/notification-utils";

/**
 * Notifications are user-owned and read through company + recipient RLS.
 * Refresh materialises the four accounting detectors using current DB states.
 * Realtime only invalidates the query; polling remains a fallback.
 */
export function useActionNotifications(companyId: string | null, userId: string, limit = 100) {
  const client = useQueryClient();
  const key = notificationQueryKey(companyId, limit);
  const inbox = useQuery({
    queryKey: key,
    enabled: Boolean(companyId),
    refetchInterval: 60_000,
    queryFn: async (): Promise<ActionNotification[]> => {
      const { error: refreshError } = await supabase.rpc("refresh_action_notifications" as never, {
        _company_id: companyId,
      } as never);
      if (refreshError) throw refreshError;
      const { data, error } = await supabase
        .from("action_notifications" as never)
        .select("id,company_id,title,body,category,priority,target_path,entity_type,entity_id,created_at,read_at,archived_at,resolved_at" as never)
        .eq("company_id" as never, companyId as never)
        .order("created_at" as never, { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as ActionNotification[];
    },
  });
  const unreadQuery = useQuery({
    queryKey: ["action-notifications-unread", companyId],
    enabled: Boolean(companyId),
    refetchInterval: 60_000,
    queryFn: async () => {
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
      .channel(`action-center:${companyId}:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "action_notifications", filter: `recipient_user_id=eq.${userId}` },
        () => {
          void client.invalidateQueries({ queryKey: ["action-notifications", companyId] });
          void client.invalidateQueries({ queryKey: ["action-notifications-unread", companyId] });
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [client, companyId, userId]);

  const changeState = useMutation({
    mutationFn: async ({ id, read, archive }: { id: string; read?: boolean; archive?: boolean }) => {
      const { data, error } = await supabase.rpc("set_action_notification_state" as never, {
        _notification_id: id, _mark_read: read ?? null, _archive: archive ?? null,
      } as never);
      if (error) throw error;
      if (!data) throw new Error("This notification is unavailable or access was denied");
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["action-notifications", companyId] });
      void client.invalidateQueries({ queryKey: ["action-notifications-unread", companyId] });
    },
    onError: (error) => notify.error(error, "Could not update notification"),
  });
  return { inbox, unreadQuery, changeState, refresh: () => client.invalidateQueries({ queryKey: ["action-notifications", companyId] }) };
}
