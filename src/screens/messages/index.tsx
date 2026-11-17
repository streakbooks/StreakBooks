import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useActiveCompany } from "@/hooks/use-active-company";
import {
  useMessagingActions,
  useMessagingConversations,
  useMessagingMessages,
  useMessagingSettings,
} from "@/hooks/use-messaging";
import type { MessagingInboxFilter, MessagingParticipant } from "@/lib/messaging/types";

const FILTERS: { id: MessagingInboxFilter; label: string }[] = [
  { id: "inbox", label: "Inbox" },
  { id: "dm", label: "Direct" },
  { id: "groups", label: "Groups" },
  { id: "unread", label: "Unread" },
  { id: "starred", label: "Starred" },
  { id: "transactions", label: "Transactions" },
  { id: "archived", label: "Archived" },
];

function messagesSearch(input: {
  filter?: MessagingInboxFilter;
  conversation?: string;
  q?: string;
}) {
  const next: {
    filter?: MessagingInboxFilter;
    conversation?: string;
    q?: string;
  } = {};
  if (input.filter) next.filter = input.filter;
  if (input.conversation) next.conversation = input.conversation;
  if (input.q) next.q = input.q;
  return next;
}

export function MessagesScreen({
  conversationId,
  filter = "inbox",
  searchQuery = "",
}: {
  conversationId?: string;
  filter?: MessagingInboxFilter;
  searchQuery?: string;
}) {
  const { company } = useActiveCompany();
  const companyId = company?.id ?? null;
  const navigate = useNavigate();
  const settings = useMessagingSettings(companyId);
  const conversations = useMessagingConversations(companyId, filter, searchQuery);
  const messages = useMessagingMessages(companyId, conversationId ?? null);
  const actions = useMessagingActions(companyId);

  const [composer, setComposer] = useState("");
  const [search, setSearch] = useState("");
  const [peerSearch, setPeerSearch] = useState("");
  const [peers, setPeers] = useState<MessagingParticipant[]>([]);
  const [groupTitle, setGroupTitle] = useState("");
  const [selectedPeers, setSelectedPeers] = useState<string[]>([]);
  const [showNew, setShowNew] = useState<"dm" | "group" | null>(null);
  const [sending, setSending] = useState(false);

  const selected = useMemo(
    () => conversations.data?.find((c) => c.id === conversationId) ?? null,
    [conversations.data, conversationId],
  );

  async function loadPeers(q: string) {
    setPeerSearch(q);
    if (!companyId) return;
    const rows = await actions.listParticipants(q);
    setPeers(rows);
  }

  async function handleSend() {
    if (!conversationId || !composer.trim() || sending) return;
    setSending(true);
    const idempotencyKey = crypto.randomUUID();
    try {
      await actions.sendMutation.mutateAsync({
        conversationId,
        body: composer,
        idempotencyKey,
      });
      setComposer("");
    } finally {
      setSending(false);
    }
  }

  if (!companyId) {
    return (
      <ListWorkspace title="Messages" description="Organisation messaging">
        <EmptyState title="Select an organisation" description="Choose a company to open Messages." />
      </ListWorkspace>
    );
  }

  if (settings.isPending) {
    return (
      <ListWorkspace title="Messages" description="Organisation messaging">
        <LoadingState />
      </ListWorkspace>
    );
  }

  if (settings.isError) {
    return (
      <ListWorkspace title="Messages" description="Organisation messaging">
        <ErrorState
          title="Messaging unavailable"
          description="Could not load messaging settings."
          onRetry={() => void settings.refetch()}
        />
      </ListWorkspace>
    );
  }

  if (!settings.data?.enabled) {
    return (
      <ListWorkspace
        title="Messages"
        description="Secure collaboration for authorised LinkBooks participants"
        breadcrumbs={[{ label: "Messages" }]}
      >
        <EmptyState
          title="Messaging is turned off"
          description="An administrator can enable Messaging & collaboration in Settings. Chat never posts, pays or approves accounting changes by itself."
        />
      </ListWorkspace>
    );
  }

  return (
    <ListWorkspace
      title="Messages"
      description="Direct messages, groups and transaction discussions"
      breadcrumbs={[{ label: "Messages" }]}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setShowNew("dm")}>
            New message
          </Button>
          <Button type="button" onClick={() => setShowNew("group")}>
            New group
          </Button>
        </div>
      }
    >
      <div className="grid min-h-[70vh] gap-4 lg:grid-cols-[240px_minmax(0,1fr)_minmax(0,1.4fr)]">
        <nav aria-label="Message folders" className="flex flex-col gap-1">
          {FILTERS.map((item) => (
            <Button
              key={item.id}
              type="button"
              variant={filter === item.id ? "secondary" : "ghost"}
              className="justify-start"
              onClick={() =>
                void navigate({
                  to: "/messages",
                  search: messagesSearch({
                    filter: item.id,
                    ...(conversationId ? { conversation: conversationId } : {}),
                  }),
                })
              }
            >
              {item.label}
            </Button>
          ))}
          <div className="mt-4 space-y-2">
            <Label htmlFor="messages-search">Search</Label>
            <Input
              id="messages-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter conversations"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                void navigate({
                  to: "/messages",
                  search: messagesSearch({
                    filter: "search",
                    q: search,
                    ...(conversationId ? { conversation: conversationId } : {}),
                  }),
                })
              }
            >
              Apply search
            </Button>
          </div>
        </nav>

        <section aria-label="Conversation list" className="rounded-lg border bg-card">
          {conversations.isPending && <LoadingState />}
          {conversations.isError && (
            <ErrorState
              title="Could not load conversations"
              description="Check your connection and try again."
              onRetry={() => void conversations.refetch()}
            />
          )}
          {!conversations.isPending &&
            !conversations.isError &&
            (conversations.data?.length ?? 0) === 0 && (
              <EmptyState
                title="No conversations"
                description="Start a direct message or create a group with eligible organisation members."
              />
            )}
          <ul className="divide-y">
            {conversations.data?.map((conversation) => (
              <li key={conversation.id}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full flex-col gap-1 px-3 py-3 text-left transition-colors hover:bg-muted/40",
                    conversationId === conversation.id && "bg-muted/60",
                  )}
                  onClick={() =>
                    void navigate({
                      to: "/messages",
                      search: messagesSearch({ filter, conversation: conversation.id }),
                    })
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">
                      {conversation.title ||
                        (conversation.conversation_type === "dm"
                          ? "Direct message"
                          : conversation.conversation_type)}
                    </span>
                    {conversation.unread && <Badge variant="default">Unread</Badge>}
                  </div>
                  <span className="truncate text-xs text-muted-foreground">
                    {conversation.last_message_preview || "No messages yet"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section aria-label="Conversation thread" className="flex min-h-[420px] flex-col rounded-lg border bg-card">
          {!conversationId && (
            <EmptyState
              title="Select a conversation"
              description="Choose a thread from the list, or start a new message."
            />
          )}
          {conversationId && (
            <>
              <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold">
                    {selected?.title ||
                      (selected?.conversation_type === "dm" ? "Direct message" : "Conversation")}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {selected?.visibility ?? "internal"} · {selected?.conversation_type ?? "thread"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      actions.membershipMutation.mutate({
                        conversationId,
                        action: selected?.is_starred ? "unstar" : "star",
                      })
                    }
                  >
                    {selected?.is_starred ? "Unstar" : "Star"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      actions.membershipMutation.mutate({
                        conversationId,
                        action: selected?.muted_until ? "unmute" : "mute",
                      })
                    }
                  >
                    {selected?.muted_until ? "Unmute" : "Mute"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      actions.membershipMutation.mutate({
                        conversationId,
                        action: "archive",
                      })
                    }
                  >
                    Archive
                  </Button>
                </div>
              </header>
              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {messages.isPending && <LoadingState />}
                {messages.isError && (
                  <ErrorState
                    title="Could not load messages"
                    description="Retry to recover missed messages after reconnecting."
                    onRetry={() => void messages.refetch()}
                  />
                )}
                {messages.data?.map((message) => (
                  <article
                    key={message.id}
                    className="rounded-md border bg-background px-3 py-2"
                    aria-label={`Message from ${message.author_name ?? "member"}`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>{message.author_name ?? "Member"}</span>
                      <time dateTime={message.created_at}>
                        {new Date(message.created_at).toLocaleString()}
                      </time>
                    </div>
                    <p className="whitespace-pre-wrap text-sm">{message.body}</p>
                  </article>
                ))}
                {!messages.isPending && !messages.isError && (messages.data?.length ?? 0) === 0 && (
                  <p className="text-sm text-muted-foreground">No messages yet. Say hello.</p>
                )}
              </div>
              <form
                className="border-t p-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleSend();
                }}
              >
                <Label htmlFor="message-composer" className="sr-only">
                  Message
                </Label>
                <Textarea
                  id="message-composer"
                  value={composer}
                  onChange={(e) => setComposer(e.target.value)}
                  placeholder="Write a message"
                  rows={3}
                  maxLength={8000}
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    Messages are saved before success is shown. Chat text cannot approve payments.
                  </p>
                  <Button type="submit" disabled={sending || !composer.trim()}>
                    {sending ? "Sending…" : "Send"}
                  </Button>
                </div>
              </form>
            </>
          )}
        </section>
      </div>

      {showNew && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={showNew === "dm" ? "New direct message" : "New group"}
          className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4"
        >
          <div className="w-full max-w-md rounded-lg border bg-card p-4 shadow-lg">
            <h3 className="text-base font-semibold">
              {showNew === "dm" ? "New direct message" : "New group"}
            </h3>
            {showNew === "group" && (
              <div className="mt-3 space-y-2">
                <Label htmlFor="group-title">Group name</Label>
                <Input
                  id="group-title"
                  value={groupTitle}
                  onChange={(e) => setGroupTitle(e.target.value)}
                  maxLength={120}
                />
              </div>
            )}
            <div className="mt-3 space-y-2">
              <Label htmlFor="peer-search">Find people</Label>
              <Input
                id="peer-search"
                value={peerSearch}
                onChange={(e) => void loadPeers(e.target.value)}
                placeholder="Search by name or email"
              />
              <ul className="max-h-48 overflow-y-auto rounded border">
                {peers.map((peer) => (
                  <li key={peer.user_id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/50"
                      onClick={() => {
                        if (showNew === "dm") {
                          actions.dmMutation.mutate(peer.user_id, {
                            onSuccess: (result) => {
                              setShowNew(null);
                              void navigate({
                                to: "/messages",
                                search: messagesSearch({
                                  filter: "dm",
                                  conversation: result.conversationId,
                                }),
                              });
                            },
                          });
                          return;
                        }
                        setSelectedPeers((prev) =>
                          prev.includes(peer.user_id)
                            ? prev.filter((id) => id !== peer.user_id)
                            : [...prev, peer.user_id],
                        );
                      }}
                    >
                      <span>
                        {peer.full_name || peer.email || peer.user_id}
                        <span className="block text-xs text-muted-foreground">{peer.email}</span>
                      </span>
                      {showNew === "group" && selectedPeers.includes(peer.user_id) && (
                        <Badge>Selected</Badge>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setShowNew(null)}>
                Cancel
              </Button>
              {showNew === "group" && (
                <Button
                  type="button"
                  disabled={!groupTitle.trim() || actions.groupMutation.isPending}
                  onClick={() =>
                    actions.groupMutation.mutate(
                      { title: groupTitle, memberUserIds: selectedPeers },
                      {
                        onSuccess: (result) => {
                          setShowNew(null);
                          setGroupTitle("");
                          setSelectedPeers([]);
                          void navigate({
                            to: "/messages",
                            search: messagesSearch({
                              filter: "groups",
                              conversation: result.conversationId,
                            }),
                          });
                        },
                      },
                    )
                  }
                >
                  Create group
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </ListWorkspace>
  );
}
