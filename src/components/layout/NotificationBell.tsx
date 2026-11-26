import { useState } from "react";
import { Bell, Check, Archive, RotateCcw, ExternalLink, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActionNotifications, safeNotificationPath } from "@/hooks/use-action-notifications";
import { sortActionNotifications } from "@/lib/notifications/notification-utils";

type Filter = "active" | "unread" | "archived";

/** Compact inbox backed by the same persisted notifications as the full Action Center. */
export function NotificationBell({
  companyId,
  userId,
}: {
  companyId: string | null;
  userId: string;
}) {
  const [filter, setFilter] = useState<Filter>("active");
  const [open, setOpen] = useState(false);
  const { inbox, unreadQuery, changeState } = useActionNotifications(companyId, userId, 100);
  const unread = unreadQuery.data ?? 0;
  const rows = inbox.data ?? [];
  const visible = sortActionNotifications(
    rows.filter((n) =>
      filter === "archived"
        ? Boolean(n.archived_at)
        : filter === "unread"
          ? !n.archived_at && !n.read_at && !n.resolved_at
          : !n.archived_at && !n.resolved_at,
    ),
    filter === "archived" ? "newest" : "priority",
  );

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative shrink-0"
          aria-label={`Notifications, ${unread} unread`}
          disabled={!companyId}
        >
          <Bell className="size-4" aria-hidden />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 rounded-full bg-destructive px-1 text-[10px] text-destructive-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(92vw,420px)] p-0">
        <div className="border-b px-4 py-3">
          <div className="font-semibold">Action Center</div>
          <p className="text-xs text-muted-foreground">
            Accounting alerts requiring your attention
          </p>
          <div className="mt-3 flex gap-2">
            {(["active", "unread", "archived"] as const).map((value) => (
              <Button
                key={value}
                variant={filter === value ? "secondary" : "ghost"}
                size="sm"
                className="capitalize"
                onClick={() => setFilter(value)}
              >
                {value}
              </Button>
            ))}
          </div>
        </div>
        <div className="max-h-[min(65vh,520px)] overflow-y-auto">
          {inbox.isPending ? (
            <p className="flex items-center gap-2 p-4 text-sm">
              <Loader2 className="size-4 animate-spin" />
              Loading notifications…
            </p>
          ) : inbox.isError ? (
            <div role="alert" className="p-4 text-sm">
              Could not load notifications.
              <Button
                size="sm"
                variant="outline"
                className="ml-2"
                onClick={() => void inbox.refetch()}
              >
                Retry
              </Button>
            </div>
          ) : inbox.isSuccess && visible.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No {filter} notifications
            </p>
          ) : inbox.isSuccess ? (
            visible.slice(0, 15).map((n) => (
              <div key={n.id} className="border-b px-4 py-3 last:border-0">
                <div className="flex items-start gap-2">
                  {!n.read_at && (
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="break-words text-sm font-medium">{n.title}</span>
                      <span className="text-[10px] uppercase text-muted-foreground">
                        {n.priority}
                      </span>
                    </div>
                    {n.body && <p className="mt-1 text-xs text-muted-foreground">{n.body}</p>}
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {new Date(n.created_at).toLocaleString()}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {safeNotificationPath(n.target_path) && (
                        <Button asChild variant="outline" size="sm">
                          <a href={safeNotificationPath(n.target_path)!}>
                            Review <ExternalLink className="ml-1 size-3" />
                          </a>
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={changeState.isPending}
                        onClick={() => changeState.mutate({ id: n.id, read: !n.read_at })}
                      >
                        <Check className="mr-1 size-3" />
                        {n.read_at ? "Unread" : "Read"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={changeState.isPending}
                        onClick={() => changeState.mutate({ id: n.id, archive: !n.archived_at })}
                      >
                        {n.archived_at ? (
                          <RotateCcw className="mr-1 size-3" />
                        ) : (
                          <Archive className="mr-1 size-3" />
                        )}
                        {n.archived_at ? "Restore" : "Archive"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : null}
        </div>
        <a
          href="/notifications"
          className="flex items-center justify-center gap-2 border-t p-3 text-sm font-medium text-primary hover:bg-muted"
        >
          Open full Action Center <ArrowRight className="size-4" />
        </a>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
