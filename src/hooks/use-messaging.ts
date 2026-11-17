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

export function useMessagingActions(companyId: string | null) {
  const client = useQueryClient();
  const send = useServerFn(sendMessagingMessage);
  const createDm = useServerFn(createDirectConversation);
  const createGroup = useServerFn(createGroupConversation);
  const updateMembership = useServerFn(updateMessagingMembership);
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

  return {
    sendMutation,
    dmMutation,
    groupMutation,
    membershipMutation,
    listParticipants: (search?: string) =>
      listParticipants({
        data: {
          companyId: companyId!,
          ...(search ? { search } : {}),
        },
      }),
  };
}
