import { createContext, useContext, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import type { VoiceFieldSpec } from "@/lib/ai-voice/fields";
import { useVoiceSession } from "./voice-context";
export const FieldOwner = createContext("");
const subscribeNone = () => () => {};
const noField = () => null;
export function useVoiceField(
  spec: VoiceFieldSpec | undefined,
  disabled: boolean | undefined,
  focus: () => void,
  close?: () => void,
) {
  const session = useVoiceSession();
  const token = useContext(FieldOwner);
  const id = spec && token ? `${token}:${spec.key}:${spec.line ?? "header"}` : "";
  const current = useRef({ focus, close });
  current.current = { focus, close };
  const signature = JSON.stringify(spec);
  useLayoutEffect(() => {
    if (!session || !id || disabled) return;
    const field: VoiceFieldSpec = JSON.parse(signature!);
    session.registerField({
      ...field,
      token,
      id,
      focus: () => current.current.focus(),
      close: () => current.current.close?.(),
    });
    return () => session.unregisterField(id);
  }, [session, id, token, signature, disabled]);
  const active = useSyncExternalStore(
    session?.subscribe ?? subscribeNone,
    session ? () => session.getSnapshot().field?.id ?? null : noField,
    noField,
  );
  return {
    "data-voice-field": id || undefined,
    "data-voice-active": active === id && Boolean(id) ? "true" : undefined,
    onFocus: () => {
      if (id) session?.fieldFocused(id);
    },
  };
}
