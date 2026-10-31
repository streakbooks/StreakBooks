import { createContext, useContext, useId, useLayoutEffect, useSyncExternalStore } from "react";
import type { AssistantController } from "@/lib/ai-voice/assistant-controller";
import type { VoiceFormAdapter } from "@/lib/ai-voice/form-adapter";
export const VoiceContext = createContext<AssistantController | null>(null);
export function useVoiceSession() {
  return useContext(VoiceContext);
}
export function useVoiceSnapshot(session: AssistantController) {
  return useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
}

/** A mounted editor registers structured state/actions; no DOM selectors or simulated clicks. */
export function useVoiceForm(adapter: Omit<VoiceFormAdapter, "token"> | null) {
  const session = useVoiceSession();
  const token = useId();
  useLayoutEffect(() => {
    if (adapter) session?.register({ ...adapter, token });
    else session?.unregister(token);
  });
  useLayoutEffect(() => () => session?.unregister(token), [session, token]);
}
