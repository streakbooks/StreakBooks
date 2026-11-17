import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type MessagingConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "offline"
  | "error";

/**
 * Surfaces realtime channel health for the messaging inbox.
 * On reconnect, callers should invalidate message queries (missed-message recovery).
 */
export function useMessagingConnection(companyId: string | null) {
  const [state, setState] = useState<MessagingConnectionState>("connecting");
  const [lastConnectedAt, setLastConnectedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) {
      setState("offline");
      return;
    }

    const onOnline = () => setState((prev) => (prev === "offline" ? "reconnecting" : prev));
    const onOffline = () => setState("offline");
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    if (!navigator.onLine) setState("offline");

    const channel = supabase
      .channel(`messaging-health:${companyId}`)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setState("connected");
          setLastConnectedAt(new Date().toISOString());
        } else if (status === "CHANNEL_ERROR") {
          setState("error");
        } else if (status === "TIMED_OUT" || status === "CLOSED") {
          setState(navigator.onLine ? "reconnecting" : "offline");
        } else {
          setState("connecting");
        }
      });

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      void supabase.removeChannel(channel);
    };
  }, [companyId]);

  return { state, lastConnectedAt };
}

export function messagingConnectionLabel(state: MessagingConnectionState): string {
  switch (state) {
    case "connected":
      return "Live";
    case "connecting":
      return "Connecting…";
    case "reconnecting":
      return "Reconnecting…";
    case "offline":
      return "Offline";
    case "error":
      return "Connection error";
  }
}
