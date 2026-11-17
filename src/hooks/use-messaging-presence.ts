import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * Low-frequency presence + ephemeral typing for a conversation channel.
 * Bodies are never sent on presence; clients still re-fetch authorised messages.
 */
export function useMessagingPresence(conversationId: string | null, userId: string | null) {
  const [onlineIds, setOnlineIds] = useState<string[]>([]);
  const [typingIds, setTypingIds] = useState<string[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastTypingAt = useRef(0);

  useEffect(() => {
    if (!conversationId || !userId) return;
    const channel = supabase.channel(`messaging-presence:${conversationId}`, {
      config: { presence: { key: userId } },
    });
    channelRef.current = channel;

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as Record<string, Array<{ user_id?: string }>>;
        const ids = Object.values(state)
          .flat()
          .map((row) => row.user_id)
          .filter((id): id is string => Boolean(id));
        setOnlineIds([...new Set(ids)]);
      })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const peer = (payload as { user_id?: string } | undefined)?.user_id;
        if (!peer || peer === userId) return;
        setTypingIds((prev) => (prev.includes(peer) ? prev : [...prev, peer]));
        window.setTimeout(() => {
          setTypingIds((prev) => prev.filter((id) => id !== peer));
        }, 2500);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ user_id: userId, at: new Date().toISOString() });
        }
      });

    return () => {
      channelRef.current = null;
      void supabase.removeChannel(channel);
      setOnlineIds([]);
      setTypingIds([]);
    };
  }, [conversationId, userId]);

  const signalTyping = async () => {
    if (!conversationId || !userId) return;
    const now = Date.now();
    if (now - lastTypingAt.current < 1200) return;
    lastTypingAt.current = now;
    const channel = channelRef.current;
    if (!channel) return;
    await channel.send({
      type: "broadcast",
      event: "typing",
      payload: { user_id: userId },
    });
  };

  return { onlineIds, typingIds, signalTyping };
}
