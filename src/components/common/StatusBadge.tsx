import * as React from "react";
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Circle,
  Clock3,
  LoaderCircle,
  MinusCircle,
  type LucideIcon,
} from "lucide-react";
import { badgeVariants } from "@/components/ui/badge-variants";
import { cn } from "@/lib/utils";
import {
  effectiveStatus,
  statusDisplay,
  type StatusTone,
} from "@/lib/status-badge";

const TONE_ICONS: Record<StatusTone, LucideIcon> = {
  neutral: Circle,
  warning: Clock3,
  info: LoaderCircle,
  success: CheckCircle2,
  complete: CheckCircle2,
  danger: AlertCircle,
};

const TONE_TEXT: Record<StatusTone, string> = {
  neutral: "text-neutral-ink",
  warning: "text-warning-ink",
  info: "text-info-ink",
  success: "text-success-ink",
  complete: "text-complete-ink",
  danger: "text-destructive-ink",
};

export interface StatusVisualProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  /** Use the persisted status from the authorised record. Never infer successful transitions. */
  status: string | null | undefined;
  /** Optional label override; semantic colour still derives only from the real status. */
  label?: string;
  /** Optional due-date logic is explicitly opt-in and requires an actual ISO current date. */
  dueDate?: string | null;
  today?: string;
  showIcon?: boolean;
}

/** Shared accessible semantic pill for lists, documents, modals, cards and reports. */
export const StatusBadge = React.forwardRef<HTMLSpanElement, StatusVisualProps>(
  ({ status, label, dueDate, today, showIcon = true, className, ...props }, ref) => {
    const actualStatus =
      status && today && dueDate ? effectiveStatus(status, dueDate, today) : status;
    const display = statusDisplay(actualStatus);
    const Icon = display.muted ? Ban : TONE_ICONS[display.tone];
    return (
      <span
        ref={ref}
        data-slot="status-badge"
        data-tone={display.tone}
        data-muted={display.muted ? "true" : undefined}
        className={cn(
          badgeVariants({ variant: display.tone }),
          "lb-status gap-1.5 rounded-full px-2.5 py-1 font-semibold leading-tight",
          className,
        )}
        {...props}
      >
        {showIcon && <Icon className="size-3.5 shrink-0" aria-hidden="true" />}
        <span>{label ?? display.label}</span>
      </span>
    );
  },
);
StatusBadge.displayName = "StatusBadge";

/** Dense alternative where cards or tables need a labelled dot, not a pill. */
export const StatusIndicator = React.forwardRef<HTMLSpanElement, StatusVisualProps>(
  ({ status, label, dueDate, today, showIcon = false, className, ...props }, ref) => {
    const actualStatus =
      status && today && dueDate ? effectiveStatus(status, dueDate, today) : status;
    const display = statusDisplay(actualStatus);
    const Icon = display.muted ? MinusCircle : TONE_ICONS[display.tone];
    return (
      <span
        ref={ref}
        data-slot="status-indicator"
        data-tone={display.tone}
        className={cn("lb-status-indicator", TONE_TEXT[display.tone], className)}
        {...props}
      >
        {showIcon ? <Icon className="size-3.5 shrink-0" aria-hidden="true" /> : null}
        <span>{label ?? display.label}</span>
      </span>
    );
  },
);
StatusIndicator.displayName = "StatusIndicator";

export interface StatusHistoryEvent {
  /** Stable ID from audit/event history; don't synthesize transitions. */
  id: string;
  status: string;
  occurredAt?: string | null;
  actor?: string | null;
  description?: string | null;
}

export interface StatusTimelineProps extends React.HTMLAttributes<HTMLOListElement> {
  /** Pass only the real persisted lifecycle events the current user may view. */
  events: readonly StatusHistoryEvent[];
}

/**
 * Read-only historical timeline. It intentionally does NOT derive fake steps
 * from the current status; each displayed step must be backed by a real event.
 */
export function StatusTimeline({ events, className, ...props }: StatusTimelineProps) {
  return (
    <ol
      aria-label="Recorded status history"
      data-slot="status-timeline"
      className={cn("space-y-3", className)}
      {...props}
    >
      {events.length === 0 ? (
        <li className="rounded-lg border border-dashed px-3 py-4 text-sm text-muted-foreground">
          No recorded status changes are available.
        </li>
      ) : (
        events.map((event) => (
          <li key={event.id} className="relative flex gap-3 border-l-2 border-border pb-2 pl-4">
            <div className="min-w-0 space-y-1">
              <StatusBadge status={event.status} />
              {event.description ? (
                <p className="text-sm leading-relaxed text-foreground">{event.description}</p>
              ) : null}
              {event.actor || event.occurredAt ? (
                <p className="text-xs text-muted-foreground">
                  {event.actor ? <span>{event.actor}</span> : null}
                  {event.actor && event.occurredAt ? <span aria-hidden="true"> · </span> : null}
                  {event.occurredAt ? (
                    <time dateTime={event.occurredAt}>{event.occurredAt}</time>
                  ) : null}
                </p>
              ) : null}
            </div>
          </li>
        ))
      )}
    </ol>
  );
}
