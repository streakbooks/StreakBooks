import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/notify";
import {
  createDirectConversation,
  createGroupConversation,
  getMessagingSettings,
  getMessagingUnreadCount,
  listEligibleMessagingParticipants,
  listMessagingConversations,
  listMessagingMessages,
  markMessagingRead,
  markMessagingUnread,
  searchMessagingMessages,
  sendMessagingMessage,
  updateMessagingMembership,
} from "@/lib/messaging/messaging.functions";
import type { MessagingInboxFilter } from "@/lib/messaging/types";

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
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [client, companyId]);

  return query;
}

export function useMessagingMessages(companyId: string | null, conversationId: string | null) {
  const list = useServerFn(listMessagingMessages);
  const markRead = useServerFn(markMessagingRead);
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["messaging-messages", companyId, conversationId],
    enabled: Boolean(companyId && conversationId),
    queryFn: () =>
      list({
        data: { companyId: companyId!, conversationId: conversationId! },
      }),
  });

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

  return query;
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

export function useMessagingActions(companyId: string | null) {
  const client = useQueryClient();
  const send = useServerFn(sendMessagingMessage);
  const createDm = useServerFn(createDirectConversation);
  const createGroup = useServerFn(createGroupConversation);
  const updateMembership = useServerFn(updateMessagingMembership);
  const markUnread = useServerFn(markMessagingUnread);
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
    mutationFn: (peerUserId: string) =>
      createDm({ data: { companyId: companyId!, peerUserId } }),
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

  const membershipMutation = useMutation({
    mutationFn: (input: {
      conversationId: string;
      action: "mute" | "unmute" | "archive" | "unarchive" | "star" | "unstar" | "leave";
    }) =>
      updateMembership({
        data: {
          companyId: companyId!,
          conversationId: input.conversationId,
          action: input.action,
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

  return {
    sendMutation,
    dmMutation,
    groupMutation,
    membershipMutation,
    markUnreadMutation,
    listParticipants: (search?: string) =>
      listParticipants({
        data: {
          companyId: companyId!,
          ...(search ? { search } : {}),
        },
      }),
  };
}
