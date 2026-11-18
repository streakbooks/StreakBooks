import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type TotalsSummaryLine = {
  id: string;
  label: string;
  value: ReactNode;
  emphasis?: "default" | "muted" | "total";
};

/**
 * Presentational accounting totals strip. Callers supply already-formatted values
 * from the financial calculation engine — this component never recalculates money.
 */
export function TotalsSummary({
  lines,
  className,
  "aria-label": ariaLabel = "Document totals",
}: {
  lines: readonly TotalsSummaryLine[];
  className?: string;
  "aria-label"?: string;
}) {
  if (lines.length === 0) return null;

  return (
    <dl
      data-slot="totals-summary"
      aria-label={ariaLabel}
      className={cn(
        "lb-totals-summary grid min-w-[14rem] max-w-sm gap-2 text-sm sm:min-w-[16rem]",
        className,
      )}
    >
      {lines.map((line) => {
        const isTotal = line.emphasis === "total";
        const isMuted = line.emphasis === "muted";
        return (
          <div
            key={line.id}
            className={cn(
              "flex items-baseline justify-between gap-6",
              isTotal && "border-t border-border/70 pt-2",
            )}
          >
            <dt
              className={cn(
                "text-muted-foreground",
                isTotal && "text-sm font-semibold text-foreground",
                isMuted && "text-xs",
              )}
            >
              {line.label}
            </dt>
            <dd
              className={cn(
                "numeric text-right tabular-nums text-foreground",
                isTotal && "text-base font-semibold tracking-tight",
                isMuted && "text-xs text-muted-foreground",
              )}
            >
              {line.value}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
