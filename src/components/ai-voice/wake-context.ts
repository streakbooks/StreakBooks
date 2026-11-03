import { createContext, useContext, useSyncExternalStore } from "react";
import type { WakeController } from "@/lib/ai-voice/wake-controller";
export const WakeContext = createContext<WakeController | null>(null);
export function useWakeController() {
  return useContext(WakeContext);
}
export function useWakeSnapshot(wake: WakeController) {
  return useSyncExternalStore(wake.subscribe, wake.getSnapshot, wake.getSnapshot);
}
