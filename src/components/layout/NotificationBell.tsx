import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, Archive, RotateCcw, ExternalLink, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { notify } from "@/lib/notify";

type ActionNotification = {
  id: string; company_id: string; title: string; body: string;
  category: string; priority: string; target_path: string | null;
  created_at: string; read_at: string | null; archived_at: string | null;
};
type Filter = "active" | "unread" | "archived";
const safePath = (path: string | null) =>
  path && /^\/(?!\/)[a-zA-Z0-9/_?=&.%-]*$/.test(path) ? path : null;

/** Persistent inbox. Financial actions always run in the source workspace, never here. */
export function NotificationBell({ companyId }: { companyId: string | null }) {
  const [filter, setFilter] = useState<Filter>("active");
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const queryKey = ["action-notifications", companyId];
  const inbox = useQuery({
    queryKey,
    enabled: Boolean(companyId),
    refetchInterval: open ? 15000 : 60000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("action_notifications" as never)
        .select("id,company_id,title,body,category,priority,target_path,created_at,read_at,archived_at" as never)
        .eq("company_id" as never, companyId as never)
        .order("created_at" as never, { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as ActionNotification[];
    },
  });
  const changeState = useMutation({
    mutationFn: async ({ id, read, archive }: { id: string; read?: boolean; archive?: boolean }) => {
      const { data, error } = await supabase.rpc("set_action_notification_state" as never, {
        _notification_id: id, _mark_read: read ?? null, _archive: archive ?? null,
      } as never);
      if (error) throw error;
      if (!data) throw new Error("Notification unavailable or access denied");
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey }),
    onError: (error) => notify.error(error, "Could not update notification"),
  });
  const rows = inbox.data ?? [];
  const unread = rows.filter((n) => !n.read_at && !n.archived_at).length;
  const visible = rows.filter((n) => filter === "archived" ? !!n.archived_at :
    filter === "unread" ? !n.archived_at && !n.read_at : !n.archived_at);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative shrink-0" aria-label={`Notifications, ${unread} unread`}>
          <Bell className="size-4" />
          {unread > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-destructive px-1 text-[10px] text-destructive-foreground">{unread > 99 ? "99+" : unread}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(92vw,420px)] p-0">
        <div className="border-b px-4 py-3">
          <div className="font-semibold">Action Center</div>
          <div className="text-xs text-muted-foreground">Review alerts in your current organisation</div>
          <div className="mt-3 flex gap-2">
            {(["active", "unread", "archived"] as const).map((f) => (
              <Button key={f} variant={filter === f ? "secondary" : "ghost"} size="sm" onClick={() => setFilter(f)} className="capitalize">{f}</Button>
            ))}
          </div>
        </div>
        <div className="max-h-[min(65vh,520px)] overflow-y-auto">
          {inbox.isPending && <p className="flex items-center gap-2 p-4 text-sm"><Loader2 className="size-4 animate-spin" />Loading notifications…</p>}
          {inbox.isError && <div className="p-4 text-sm">Could not load notifications. <Button size="sm" variant="outline" onClick={() => void inbox.refetch()}>Retry</Button></div>}
          {!inbox.isPending && !inbox.isError && visible.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No {filter} notifications</p>}
          {visible.map((n) => (
            <div key={n.id} className="border-b px-4 py-3 last:border-0">
              <div className="flex items-start gap-2">
                {!n.read_at && !n.archived_at && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{n.title}</span>
                    <span className="text-[10px] uppercase text-muted-foreground">{n.priority}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{n.body}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{new Date(n.created_at).toLocaleString()}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {safePath(n.target_path) && <Button asChild variant="outline" size="sm"><a href={safePath(n.target_path)!}>Review <ExternalLink className="ml-1 size-3" /></a></Button>}
                    <Button variant="ghost" size="sm" disabled={changeState.isPending} onClick={() => changeState.mutate({ id: n.id, read: !n.read_at })}>
                      <Check className="mr-1 size-3" />{n.read_at ? "Mark unread" : "Mark read"}
                    </Button>
                    <Button variant="ghost" size="sm" disabled={changeState.isPending} onClick={() => changeState.mutate({ id: n.id, archive: !n.archived_at })}>
                      {n.archived_at ? <RotateCcw className="mr-1 size-3" /> : <Archive className="mr-1 size-3" />}
                      {n.archived_at ? "Restore" : "Archive"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        {rows.length === 100 && <p className="border-t p-2 text-center text-xs text-muted-foreground">Showing latest 100 notifications</p>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
