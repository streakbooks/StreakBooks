import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/notify";
import { showMessagingDesktopNotification } from "@/lib/messaging/desktop-notify";
import {
  createChannelConversation,
  createDirectConversation,
  createGroupConversation,
  getMessagingNotificationPreferences,
  getMessagingSettings,
  getMessagingUnreadCount,
  listEligibleMessagingParticipants,
  listMessagingConversations,
  listMessagingMessages,
  getMessagingConversationRecordLink,
  markAllMessagingRead,
  markMessagingRead,
  markMessagingUnread,
  searchMessagingAcrossConversations,
  searchMessagingMessages,
  sendMessagingMessage,
  updateMessagingMembership,
} from "@/lib/messaging/messaging.functions";
import { isWithinMessagingQuietHours } from "@/lib/messaging/quiet-hours";
import type { MessagingInboxFilter, MessagingMessage } from "@/lib/messaging/types";

let messagingChannelSequence = 0;

export function useMessagingUnread(companyId: string | null) {
  const fetchUnread = useServerFn(getMessagingUnreadCount);
  return useQuery({
    queryKey: ["messaging-unread", companyId],
    enabled: Boolean(companyId),
    refetchInterval: 60_000,
    queryFn: () => fetchUnread({ data: { companyId: companyId! } }),
  });
}

export function useMessagingSettings(companyId: string | null) {
  const fetchSettings = useServerFn(getMessagingSettings);
  return useQuery({
    queryKey: ["messaging-settings", companyId],
    enabled: Boolean(companyId),
    queryFn: () => fetchSettings({ data: { companyId: companyId! } }),
  });
}

export function useMessagingConversations(
  companyId: string | null,
  filter: MessagingInboxFilter,
  q = "",
) {
  const list = useServerFn(listMessagingConversations);
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["messaging-conversations", companyId, filter, q],
    enabled: Boolean(companyId),
    refetchInterval: 45_000,
    queryFn: () => list({ data: { companyId: companyId!, filter, q } }),
  });

  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel(`messaging-inbox:${companyId}:${++messagingChannelSequence}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messaging_outbox_events",
          filter: `company_id=eq.${companyId}`,
        },
        () => {
          void client.invalidateQueries({ queryKey: ["messaging-conversations", companyId] });
          void client.invalidateQueries({ queryKey: ["messaging-unread", companyId] });
          void client.invalidateQueries({ queryKey: ["messaging-messages", companyId] });
          const prefs = client.getQueryData<{
            push_enabled?: boolean;
            quiet_hours_start?: string | null;
            quiet_hours_end?: string | null;
          }>(["messaging-notification-prefs", companyId]);
          if (isWithinMessagingQuietHours(prefs?.quiet_hours_start, prefs?.quiet_hours_end)) {
            return;
          }
          showMessagingDesktopNotification(
            {
              title: "New StreakBooks message",
              body: "You have new activity in Messages.",
              tag: `messaging-${companyId}`,
              href: "/messages",
            },
            {
              pushEnabled: prefs?.push_enabled === true,
              quietHoursStart: prefs?.quiet_hours_start ?? null,
              quietHoursEnd: prefs?.quiet_hours_end ?? null,
            },
          );
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [client, companyId]);

  return query;
}

/** Prefetch notification prefs so desktop notify can honour push_enabled. */
export function useMessagingNotificationPrefsWarm(companyId: string | null) {
  const fetchPrefs = useServerFn(getMessagingNotificationPreferences);
  return useQuery({
    queryKey: ["messaging-notification-prefs", companyId],
    enabled: Boolean(companyId),
    staleTime: 60_000,
    queryFn: () => fetchPrefs({ data: { companyId: companyId! } }),
  });
}

const MESSAGING_PAGE_SIZE = 200;
const MESSAGING_OLDER_PAGE_SIZE = 50;

export function useMessagingMessages(companyId: string | null, conversationId: string | null) {
  const list = useServerFn(listMessagingMessages);
  const markRead = useServerFn(markMessagingRead);
  const client = useQueryClient();
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const conversationRef = useRef(conversationId);

  useEffect(() => {
    if (conversationRef.current !== conversationId) {
      conversationRef.current = conversationId;
      setHasMoreOlder(true);
      setLoadingOlder(false);
    }
  }, [conversationId]);

  const query = useQuery({
    queryKey: ["messaging-messages", companyId, conversationId],
    enabled: Boolean(companyId && conversationId),
    queryFn: async () => {
      const rows = await list({
        data: {
          companyId: companyId!,
          conversationId: conversationId!,
          limit: MESSAGING_PAGE_SIZE,
        },
      });
      setHasMoreOlder(rows.length >= MESSAGING_PAGE_SIZE);
      return rows;
    },
  });

  async function loadOlder() {
    if (!companyId || !conversationId || loadingOlder || !hasMoreOlder) return;
    const cached =
      client.getQueryData<MessagingMessage[]>(["messaging-messages", companyId, conversationId]) ??
      [];
    const firstSeq = cached[0]?.seq;
    if (!firstSeq) {
      setHasMoreOlder(false);
      return;
    }
    setLoadingOlder(true);
    try {
      const older = await list({
        data: {
          companyId,
          conversationId,
          beforeSeq: firstSeq,
          limit: MESSAGING_OLDER_PAGE_SIZE,
        },
      });
      if (!older.length) {
        setHasMoreOlder(false);
        return;
      }
      setHasMoreOlder(older.length >= MESSAGING_OLDER_PAGE_SIZE);
      const byId = new Map<string, MessagingMessage>();
      for (const row of [...older, ...cached]) byId.set(row.id, row);
      const merged = [...byId.values()].sort((a, b) => a.seq - b.seq);
      client.setQueryData(["messaging-messages", companyId, conversationId], merged);
    } finally {
      setLoadingOlder(false);
    }
  }

  useEffect(() => {
    if (!companyId || !conversationId || !query.data?.length) return;
    const last = query.data[query.data.length - 1];
    if (!last) return;
    void markRead({
      data: { companyId, conversationId, seq: last.seq },
    }).then(() => {
      void client.invalidateQueries({ queryKey: ["messaging-unread", companyId] });
      void client.invalidateQueries({ queryKey: ["messaging-conversations", companyId] });
    });
  }, [client, companyId, conversationId, markRead, query.data]);

  return { ...query, hasMoreOlder, loadingOlder, loadOlder };
}

/** Recover messages after a reconnect gap using afterSeq. */
export function useMessagingMissedRecovery(
  companyId: string | null,
  conversationId: string | null,
  connectionState: string,
) {
  const list = useServerFn(listMessagingMessages);
  const client = useQueryClient();

  useEffect(() => {
    if (!companyId || !conversationId) return;
    if (connectionState !== "connected" && connectionState !== "reconnecting") return;

    const cached = client.getQueryData<Array<{ seq: number }>>([
      "messaging-messages",
      companyId,
      conversationId,
    ]);
    const afterSeq = cached?.length ? Math.max(...cached.map((m) => Number(m.seq) || 0)) : 0;

    void list({
      data: { companyId, conversationId, afterSeq },
    }).then((rows) => {
      if (!rows?.length) {
        void client.invalidateQueries({
          queryKey: ["messaging-messages", companyId, conversationId],
        });
        return;
      }
      void client.invalidateQueries({
        queryKey: ["messaging-messages", companyId, conversationId],
      });
      void client.invalidateQueries({ queryKey: ["messaging-conversations", companyId] });
      void client.invalidateQueries({ queryKey: ["messaging-unread", companyId] });
    });
  }, [client, companyId, connectionState, conversationId, list]);
}

export function useMessagingConversationRecordLink(
  companyId: string | null,
  conversationId: string | null,
) {
  const fetchLink = useServerFn(getMessagingConversationRecordLink);
  return useQuery({
    queryKey: ["messaging-record-link", companyId, conversationId],
    enabled: Boolean(companyId && conversationId),
    queryFn: () =>
      fetchLink({
        data: { companyId: companyId!, conversationId: conversationId! },
      }),
  });
}

export function useMessagingThreadSearch(
  companyId: string | null,
  conversationId: string | null,
  q: string,
) {
  const search = useServerFn(searchMessagingMessages);
  return useQuery({
    queryKey: ["messaging-thread-search", companyId, conversationId, q],
    enabled: Boolean(companyId && conversationId && q.trim().length >= 2),
    queryFn: () =>
      search({
        data: {
          companyId: companyId!,
          conversationId: conversationId!,
          q: q.trim(),
        },
      }),
  });
}

export function useMessagingGlobalSearch(companyId: string | null, q: string) {
  const search = useServerFn(searchMessagingAcrossConversations);
  return useQuery({
    queryKey: ["messaging-global-search", companyId, q],
    enabled: Boolean(companyId && q.trim().length >= 2),
    queryFn: () =>
      search({
        data: {
          companyId: companyId!,
          q: q.trim(),
        },
      }),
  });
}

export function useMessagingActions(companyId: string | null) {
  const client = useQueryClient();
  const send = useServerFn(sendMessagingMessage);
  const createDm = useServerFn(createDirectConversation);
  const createGroup = useServerFn(createGroupConversation);
  const createChannel = useServerFn(createChannelConversation);
  const updateMembership = useServerFn(updateMessagingMembership);
  const markUnread = useServerFn(markMessagingUnread);
  const markAllRead = useServerFn(markAllMessagingRead);
  const listParticipants = useServerFn(listEligibleMessagingParticipants);

  const invalidate = () => {
    void client.invalidateQueries({ queryKey: ["messaging-conversations", companyId] });
    void client.invalidateQueries({ queryKey: ["messaging-messages", companyId] });
    void client.invalidateQueries({ queryKey: ["messaging-unread", companyId] });
  };

  const sendMutation = useMutation({
    mutationFn: (input: {
      conversationId: string;
      body: string;
      idempotencyKey: string;
      replyToMessageId?: string | null;
    }) =>
      send({
        data: {
          companyId: companyId!,
          conversationId: input.conversationId,
          body: input.body,
          idempotencyKey: input.idempotencyKey,
          replyToMessageId: input.replyToMessageId ?? null,
        },
      }),
    onSuccess: invalidate,
    onError: (error) => notify.error(error, "Could not send message"),
  });

  const dmMutation = useMutation({
    mutationFn: (peerUserId: string) => createDm({ data: { companyId: companyId!, peerUserId } }),
    onSuccess: invalidate,
    onError: (error) => notify.error(error, "Could not start conversation"),
  });

  const groupMutation = useMutation({
    mutationFn: (input: { title: string; description?: string; memberUserIds?: string[] }) =>
      createGroup({
        data: {
          companyId: companyId!,
          title: input.title,
          ...(input.description ? { description: input.description } : {}),
          ...(input.memberUserIds ? { memberUserIds: input.memberUserIds } : {}),
        },
      }),
    onSuccess: invalidate,
    onError: (error) => notify.error(error, "Could not create group"),
  });

  const channelMutation = useMutation({
    mutationFn: (input: { title: string; description?: string; memberUserIds?: string[] }) =>
      createChannel({
        data: {
          companyId: companyId!,
          title: input.title,
          ...(input.description ? { description: input.description } : {}),
          ...(input.memberUserIds ? { memberUserIds: input.memberUserIds } : {}),
        },
      }),
    onSuccess: invalidate,
    onError: (error) => notify.error(error, "Could not create channel"),
  });

  const membershipMutation = useMutation({
    mutationFn: (input: {
      conversationId: string;
      action: "mute" | "unmute" | "archive" | "unarchive" | "star" | "unstar" | "leave";
      muteHours?: number;
    }) =>
      updateMembership({
        data: {
          companyId: companyId!,
          conversationId: input.conversationId,
          action: input.action,
          ...(typeof input.muteHours === "number" ? { muteHours: input.muteHours } : {}),
        },
      }),
    onSuccess: invalidate,
    onError: (error) => notify.error(error, "Could not update conversation"),
  });

  const markUnreadMutation = useMutation({
    mutationFn: (conversationId: string) =>
      markUnread({ data: { companyId: companyId!, conversationId } }),
    onSuccess: () => {
      invalidate();
      notify.success("Marked unread");
    },
    onError: (error) => notify.error(error, "Could not mark unread"),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => markAllRead({ data: { companyId: companyId! } }),
    onSuccess: (result) => {
      invalidate();
      notify.success(
        result.marked > 0
          ? `Marked ${result.marked} conversation${result.marked === 1 ? "" : "s"} read`
          : "Inbox already caught up",
      );
    },
    onError: (error) => notify.error(error, "Could not mark all read"),
  });

  return {
    sendMutation,
    dmMutation,
    groupMutation,
    channelMutation,
    membershipMutation,
    markUnreadMutation,
    markAllReadMutation,
    listParticipants: (search?: string) =>
      listParticipants({
        data: {
          companyId: companyId!,
          ...(search ? { search } : {}),
        },
      }),
  };
}
