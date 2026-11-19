import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { MessageSquare, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  useMessagingConversations,
  useMessagingSettings,
  useMessagingUnread,
} from "@/hooks/use-messaging";

/** Header slide-out messaging panel. Preserves the current page underneath. */
export function MessagesBell({ companyId }: { companyId: string | null }) {
  const [open, setOpen] = useState(false);
  const unread = useMessagingUnread(companyId);
  const settings = useMessagingSettings(companyId);
  const inbox = useMessagingConversations(companyId, "inbox");
  const count = unread.data ?? 0;
  const settingsPending = settings.isPending;
  const settingsFailed = settings.isError;
  const enabled = settings.data?.enabled === true;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative shrink-0"
          aria-label={`Messages, ${count} unread`}
          disabled={!companyId}
        >
          <MessageSquare className="size-4" aria-hidden />
          {count > 0 && (
            <span className="absolute -right-1 -top-1 rounded-full bg-primary px-1 text-[10px] text-primary-foreground">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-4 py-3 text-left">
          <SheetTitle>Messages</SheetTitle>
          <SheetDescription>
            {settingsPending
              ? "Loading messaging settings…"
              : settingsFailed
                ? "Could not load messaging settings."
                : enabled
                  ? "Recent conversations. Open the full workspace for search and settings."
                  : "Messaging is disabled for this organisation. An administrator can enable it in Settings."}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto">
          {settingsPending ? (
            <p className="flex items-center gap-2 p-4 text-sm">
              <Loader2 className="size-4 animate-spin" />
              Loading messaging settings…
            </p>
          ) : null}
          {settingsFailed ? (
            <div role="alert" className="p-4 text-sm">
              Could not load messaging settings.
              <Button
                size="sm"
                variant="outline"
                className="ml-2"
                onClick={() => void settings.refetch()}
              >
                Retry
              </Button>
            </div>
          ) : null}
          {!settingsPending && !settingsFailed && !enabled ? (
            <p className="p-4 text-sm text-muted-foreground">
              Enable Messaging &amp; collaboration to start chatting with authorised colleagues.
            </p>
          ) : null}
          {enabled && inbox.isPending && (
            <p className="flex items-center gap-2 p-4 text-sm">
              <Loader2 className="size-4 animate-spin" />
              Loading conversations…
            </p>
          )}
          {enabled && inbox.isError && (
            <div role="alert" className="p-4 text-sm">
              Could not load conversations.
              <Button
                size="sm"
                variant="outline"
                className="ml-2"
                onClick={() => void inbox.refetch()}
              >
                Retry
              </Button>
            </div>
          )}
          {enabled && !inbox.isPending && !inbox.isError && (inbox.data?.length ?? 0) === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">No conversations yet</p>
          )}
          {enabled &&
            inbox.data?.slice(0, 12).map((conversation) => (
              <Link
                key={conversation.id}
                to="/messages"
                search={{
                  filter: "inbox",
                  ...(conversation.id ? { conversation: conversation.id } : {}),
                }}
                className="block border-b px-4 py-3 transition-colors hover:bg-muted/50"
                onClick={() => setOpen(false)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {conversation.title ||
                        (conversation.conversation_type === "dm"
                          ? "Direct message"
                          : "Conversation")}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {conversation.last_message_preview || "No messages yet"}
                    </p>
                  </div>
                  {conversation.unread && (
                    <span
                      className="mt-1 size-2 shrink-0 rounded-full bg-primary"
                      aria-label="Unread"
                    />
                  )}
                </div>
              </Link>
            ))}
        </div>
        <div className="border-t p-3">
          <Button asChild className="w-full" onClick={() => setOpen(false)}>
            <Link to="/messages" search={{ filter: "inbox" }}>
              Open Messages workspace
            </Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
