"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Switch bound to a persisted setting.
 * Shows loading while saving; rolls UI back if onPersist rejects.
 * Do not use for cosmetic-only local toggles.
 */
export function PersistedSwitch({
  id,
  checked,
  onPersist,
  disabled,
  disabledReason,
  "aria-label": ariaLabel,
  className,
}: {
  id?: string;
  checked: boolean;
  onPersist: (next: boolean) => Promise<unknown> | unknown;
  disabled?: boolean;
  disabledReason?: string;
  "aria-label"?: string;
  className?: string;
}) {
  const [pending, setPending] = useState(false);
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const display = optimistic ?? checked;

  const control = (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Switch
        {...(id !== undefined ? { id } : {})}
        checked={display}
        disabled={disabled || pending}
        aria-busy={pending || undefined}
        {...(ariaLabel !== undefined ? { "aria-label": ariaLabel } : {})}
        onCheckedChange={(next) => {
          if (pending || disabled) return;
          setOptimistic(next);
          setPending(true);
          void Promise.resolve(onPersist(next))
            .catch(() => {
              setOptimistic(checked);
            })
            .finally(() => {
              setPending(false);
              setOptimistic(null);
            });
        }}
      />
      {pending ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden /> : null}
    </span>
  );

  if (!disabled || !disabledReason) return control;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{control}</TooltipTrigger>
        <TooltipContent>{disabledReason}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
