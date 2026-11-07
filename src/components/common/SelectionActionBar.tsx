import type { ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  count: number;
  onClear: () => void;
  children?: ReactNode;
  description?: string;
};

/**
 * Common, accessible contextual action bar for selected list rows.
 * The caller still owns permission checks, mutation confirmations and selection resets.
 */
export function SelectionActionBar({ count, onClear, children, description }: Props) {
  if (count < 1) return null;
  return (
    <section
      aria-label="Selected record actions"
      aria-live="polite"
      className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 shadow-xs print:hidden"
    >
      <div className="min-w-0">
        <p className="text-sm font-bold tabular-nums text-foreground">
          {count} {count === 1 ? "record" : "records"} selected
        </p>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2 border-l border-primary/15 pl-3">{children}</div> : null}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="ml-auto"
        aria-label="Clear selected records"
        onClick={onClear}
      >
        <X className="size-4" aria-hidden />
        Clear selection
      </Button>
    </section>
  );
}
