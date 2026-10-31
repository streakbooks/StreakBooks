import { useCallback, useRef, type ComponentProps, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import type { VoiceFieldSpec } from "@/lib/ai-voice/fields";
import { FieldOwner, useVoiceField } from "./field-context";
export function VoiceFields({ token, children }: { token: string; children: ReactNode }) {
  return <FieldOwner.Provider value={token}>{children}</FieldOwner.Provider>;
}
export function VoiceInput({
  voiceField,
  ref: externalRef,
  ...props
}: ComponentProps<typeof Input> & { voiceField?: VoiceFieldSpec }) {
  const ref = useRef<HTMLInputElement>(null);
  const bindRef = useCallback(
    (node: HTMLInputElement | null) => {
      ref.current = node;
      if (typeof externalRef === "function") return externalRef(node);
      else if (externalRef) externalRef.current = node;
    },
    [externalRef],
  );
  const field = useVoiceField(voiceField, props.disabled || props.readOnly, () => {
    ref.current?.focus();
    ref.current?.scrollIntoView({ block: "nearest" });
  });
  return (
    <Input
      {...props}
      {...field}
      ref={bindRef}
      onFocus={(e) => {
        field.onFocus();
        props.onFocus?.(e);
      }}
    />
  );
}
export function VoiceSelect({
  voiceField,
  ref: externalRef,
  ...props
}: ComponentProps<"select"> & { voiceField?: VoiceFieldSpec }) {
  const ref = useRef<HTMLSelectElement>(null);
  const bindRef = useCallback(
    (node: HTMLSelectElement | null) => {
      ref.current = node;
      if (typeof externalRef === "function") return externalRef(node);
      else if (externalRef) externalRef.current = node;
    },
    [externalRef],
  );
  const field = useVoiceField(voiceField, props.disabled, () => ref.current?.focus());
  return (
    <select
      {...props}
      {...field}
      ref={bindRef}
      onFocus={(e) => {
        field.onFocus();
        props.onFocus?.(e);
      }}
    />
  );
}
