import { AlertOctagon, ArrowUp, Circle, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { notificationPriorityDisplay } from "@/lib/notifications/priority-visual";

/** Priority is not approval/record status. Keep it separate from StatusBadge. */
export function NotificationPriorityBadge({ priority }: { priority: string | null | undefined }) {
  const display = notificationPriorityDisplay(priority);
  const Icon: LucideIcon =
    display.tone === "danger" ? AlertOctagon :
    display.tone === "warning" ? ArrowUp : Circle;

  return (
    <Badge
      variant={display.tone}
      className="gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold"
      data-slot="notification-priority-badge"
      data-priority={display.priority}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {display.label}
    </Badge>
  );
}
