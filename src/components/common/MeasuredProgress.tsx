import { Progress } from "@/components/ui/progress";
import {
  measuredProgressLabel,
  measuredProgressPercent,
  type MeasuredProgressValues,
} from "@/lib/ui/measured-progress";
import { cn } from "@/lib/utils";

/**
 * Progress indicator bound to real completed/total counts.
 * Does not invent percentages — callers must supply measurable values.
 */
export function MeasuredProgress({
  completed,
  total,
  label,
  unit,
  emptyLabel,
  className,
  tone = "auto",
}: MeasuredProgressValues & {
  label?: string;
  unit?: string;
  emptyLabel?: string;
  className?: string;
  /** auto → complete uses success, otherwise primary */
  tone?: "auto" | "primary" | "success" | "info" | "warning";
}) {
  const percent = measuredProgressPercent({ completed, total });
  const text =
    label ??
    measuredProgressLabel(
      { completed, total },
      {
        ...(unit !== undefined ? { unit } : {}),
        ...(emptyLabel !== undefined ? { emptyLabel } : {}),
      },
    );
  const resolvedTone =
    tone === "auto" ? (total > 0 && percent >= 100 ? "success" : "primary") : tone;
  const indicatorClassName =
    resolvedTone === "success"
      ? "bg-success"
      : resolvedTone === "info"
        ? "bg-info"
        : resolvedTone === "warning"
          ? "bg-warning"
          : undefined;

  return (
    <div
      data-slot="measured-progress"
      className={cn("space-y-1.5", className)}
      role="group"
      aria-label={text}
    >
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{text}</span>
        <span className="tabular-nums">{total === 0 ? "—" : `${percent}%`}</span>
      </div>
      <Progress
        value={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={text}
        {...(indicatorClassName ? { indicatorClassName } : {})}
      />
    </div>
  );
}
