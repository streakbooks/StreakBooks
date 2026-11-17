import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useRouteContext } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ConversationFiles } from "@/components/messaging/ConversationFiles";
import { ConversationMembers } from "@/components/messaging/ConversationMembers";
import { ConversationPinned } from "@/components/messaging/ConversationPinned";
import { MessageActions } from "@/components/messaging/MessageActions";
import { MessageReceipts } from "@/components/messaging/MessageReceipts";
import { MessagingAiAssistPanel } from "@/components/messaging/MessagingAiAssistPanel";
import { MessagingVoiceVideoPanel } from "@/components/messaging/MessagingVoiceVideoPanel";
import { SafeMessageBody } from "@/components/messaging/SafeMessageBody";
import { StarredMessages } from "@/components/messaging/StarredMessages";
import { cn } from "@/lib/utils";
import { useActiveCompany } from "@/hooks/use-active-company";
import {
  useMessagingActions,
  useMessagingConversations,
  useMessagingGlobalSearch,
  useMessagingMessages,
  useMessagingMissedRecovery,
  useMessagingNotificationPrefsWarm,
  useMessagingSettings,
  useMessagingThreadSearch,
} from "@/hooks/use-messaging";
import {
  messagingConnectionLabel,
  useMessagingConnection,
} from "@/hooks/use-messaging-connection";
import { useMessagingPresence } from "@/hooks/use-messaging-presence";
import type { MessagingInboxFilter, MessagingParticipant } from "@/lib/messaging/types";
import {
  addMessagingInternalMembers,
  openAccountantClientConversation,
  openAdvisorEngagementConversation,
  openHrPrivateConversation,
  registerMessagingAttachment,
  renameMessagingConversation,
  requestMessagingFormalApproval,
} from "@/lib/messaging/messaging.functions";
import { insertMentionToken } from "@/lib/messaging/mentions";
import {
  canSendMessagingNow,
  createMessagingSendPaceState,
  recordMessagingSend,
} from "@/lib/messaging/rate-limit";
import {
  clearMessagingComposerDraft,
  loadMessagingComposerDraft,
  saveMessagingComposerDraft,
} from "@/lib/messaging/composer-drafts";
import {
  buildMessagingThreadExport,
  downloadTextFile,
} from "@/lib/messaging/export-thread";
import { uploadMessagingAttachment } from "@/lib/messaging/upload-client";
import { notify } from "@/lib/notify";
import { looksLikeInformalApproval } from "@/lib/messaging/approvals";
import type { MessagingMessage } from "@/lib/messaging/types";

const FILTERS: { id: MessagingInboxFilter; label: string }[] = [
  { id: "inbox", label: "Inbox" },
  { id: "dm", label: "Direct" },
  { id: "groups", label: "Groups" },
  { id: "mentions", label: "Mentions" },
  { id: "unread", label: "Unread" },
  { id: "starred", label: "Starred" },
  { id: "files", label: "Files" },
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
  const { user } = useRouteContext({ from: "/_authenticated" });
  const companyId = company?.id ?? null;
  const navigate = useNavigate();
  const settings = useMessagingSettings(companyId);
  const conversations = useMessagingConversations(companyId, filter, searchQuery);
  const messages = useMessagingMessages(companyId, conversationId ?? null);
  const actions = useMessagingActions(companyId);
  const presence = useMessagingPresence(conversationId ?? null, user?.id ?? null);
  const connection = useMessagingConnection(companyId);
  useMessagingMissedRecovery(companyId, conversationId ?? null, connection.state);
  useMessagingNotificationPrefsWarm(companyId);

  const [composer, setComposer] = useState("");
  const [search, setSearch] = useState(searchQuery);
  const [threadSearch, setThreadSearch] = useState("");
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null);
  const [liveAnnounce, setLiveAnnounce] = useState("");
  const [peerSearch, setPeerSearch] = useState("");
  const [peers, setPeers] = useState<MessagingParticipant[]>([]);
  const [groupTitle, setGroupTitle] = useState("");
  const [selectedPeers, setSelectedPeers] = useState<string[]>([]);
  const [showNew, setShowNew] = useState<
    "dm" | "group" | "channel" | "hr" | "advisor" | "accountant" | null
  >(null);
  const [forwardMessage, setForwardMessage] = useState<MessagingMessage | null>(null);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [approvalPeer, setApprovalPeer] = useState("");
  const [showFiles, setShowFiles] = useState(false);
  const [showPinned, setShowPinned] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [replyTo, setReplyTo] = useState<MessagingMessage | null>(null);
  const [sendPace, setSendPace] = useState(() => createMessagingSendPaceState());
  const [receiptMessageId, setReceiptMessageId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [showRename, setShowRename] = useState(false);
  const queryClient = useQueryClient();
  const registerAttachment = useServerFn(registerMessagingAttachment);
  const requestApproval = useServerFn(requestMessagingFormalApproval);
  const openHr = useServerFn(openHrPrivateConversation);
  const openAdvisor = useServerFn(openAdvisorEngagementConversation);
  const openAccountant = useServerFn(openAccountantClientConversation);
  const addMembers = useServerFn(addMessagingInternalMembers);
  const renameConversation = useServerFn(renameMessagingConversation);

  useEffect(() => {
    setComposer(loadMessagingComposerDraft(companyId, conversationId ?? null));
    setReplyTo(null);
    setShowRename(false);
    setRenameTitle("");
  }, [companyId, conversationId]);

  useEffect(() => {
    saveMessagingComposerDraft(companyId, conversationId ?? null, composer);
  }, [companyId, conversationId, composer]);
  const threadHits = useMessagingThreadSearch(
    companyId,
    conversationId ?? null,
    threadSearch,
  );
  const globalHits = useMessagingGlobalSearch(
    companyId,
    filter === "search" ? searchQuery || search : "",
  );

  const selected = useMemo(
    () => conversations.data?.find((c) => c.id === conversationId) ?? null,
    [conversations.data, conversationId],
  );

  useEffect(() => {
    const rows = messages.data;
    if (!rows?.length) return;
    const last = rows[rows.length - 1];
    if (!last || last.author_user_id === user?.id) return;
    setLiveAnnounce(`New message from ${last.author_name ?? "member"}: ${last.body.slice(0, 80)}`);
  }, [messages.data, user?.id]);

  useEffect(() => {
    if (!highlightMessageId || !messages.data?.some((m) => m.id === highlightMessageId)) return;
    const el = document.getElementById(`msg-${highlightMessageId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightMessageId, messages.data]);

  async function loadPeers(q: string) {
    setPeerSearch(q);
    if (!companyId) return;
    const rows = await actions.listParticipants(q);
    setPeers(rows);
  }

  async function handleSend() {
    if (!conversationId || !composer.trim() || sending) return;
    const pace = canSendMessagingNow(sendPace);
    if (!pace.ok) {
      notify.warning("Slow down", pace.reason);
      return;
    }
    setSending(true);
    const idempotencyKey = crypto.randomUUID();
    try {
      await actions.sendMutation.mutateAsync({
        conversationId,
        body: composer,
        idempotencyKey,
        ...(replyTo ? { replyToMessageId: replyTo.id } : {}),
      });
      setSendPace((prev) => recordMessagingSend(prev));
      setComposer("");
      clearMessagingComposerDraft(companyId, conversationId);
      setReplyTo(null);
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
          <Button type="button" variant="outline" asChild>
            <Link to="/messages/settings">Settings</Link>
          </Button>
          <Button type="button" variant="outline" onClick={() => setShowNew("dm")}>
            New message
          </Button>
          <Button type="button" variant="outline" onClick={() => setShowNew("group")}>
            New group
          </Button>
          <Button type="button" variant="outline" onClick={() => setShowNew("channel")}>
            New channel
          </Button>
          <Button type="button" variant="outline" onClick={() => setShowNew("hr")}>
            Private HR
          </Button>
          <Button type="button" variant="outline" onClick={() => setShowNew("accountant")}>
            Accountant chat
          </Button>
          <Button type="button" onClick={() => setShowNew("advisor")}>
            Advisor chat
          </Button>
        </div>
      }
    >
      {company?.is_demo ? (
        <div
          role="status"
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100"
        >
          Demo company: messaging uses the same engine as live organisations. Reset and destructive
          demo tools remain gated; posting and validation are not.
        </div>
      ) : null}
      <div aria-live="polite" className="sr-only">
        {liveAnnounce}
      </div>
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
          {filter === "starred" && companyId ? (
            <div className="border-b p-3">
              <h3 className="mb-2 text-sm font-semibold">Starred messages</h3>
              <StarredMessages
                companyId={companyId}
                onOpenConversation={(id) =>
                  void navigate({
                    to: "/messages",
                    search: messagesSearch({ filter: "starred", conversation: id }),
                  })
                }
              />
            </div>
          ) : null}
          {filter === "search" && (searchQuery || search).trim().length >= 2 ? (
            <div className="border-b p-3">
              <h3 className="mb-2 text-sm font-semibold">Message matches</h3>
              {globalHits.isPending ? (
                <p className="text-xs text-muted-foreground">Searching messages…</p>
              ) : null}
              {globalHits.data?.length === 0 ? (
                <p className="text-xs text-muted-foreground">No message matches</p>
              ) : null}
              <ul className="max-h-48 space-y-1 overflow-y-auto">
                {globalHits.data?.map((hit) => (
                  <li key={hit.id}>
                    <button
                      type="button"
                      className="block w-full truncate rounded px-2 py-1 text-left text-xs hover:bg-muted/50"
                      onClick={() => {
                        setHighlightMessageId(hit.id);
                        void navigate({
                          to: "/messages",
                          search: messagesSearch({
                            filter: "search",
                            q: searchQuery || search,
                            conversation: hit.conversation_id,
                          }),
                        });
                      }}
                    >
                      <span className="font-medium">
                        {hit.conversation_title || hit.conversation_type}
                      </span>{" "}
                      · {hit.body}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
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
                    {presence.onlineIds.length > 1 ? ` · ${presence.onlineIds.length} online` : ""}
                    {presence.typingIds.length
                      ? ` · ${presence.typingIds.length} typing`
                      : ""}
                    {" · "}
                    <span
                      className={cn(
                        connection.state === "connected" && "text-emerald-700 dark:text-emerald-400",
                        (connection.state === "offline" || connection.state === "error") &&
                          "text-destructive",
                        (connection.state === "reconnecting" || connection.state === "connecting") &&
                          "text-amber-700 dark:text-amber-400",
                      )}
                    >
                      {messagingConnectionLabel(connection.state)}
                    </span>
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
                    disabled={actions.markUnreadMutation.isPending}
                    onClick={() => actions.markUnreadMutation.mutate(conversationId)}
                  >
                    Mark unread
                  </Button>
                  {selected?.muted_until ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        actions.membershipMutation.mutate({
                          conversationId,
                          action: "unmute",
                        })
                      }
                    >
                      Unmute
                    </Button>
                  ) : (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          actions.membershipMutation.mutate({
                            conversationId,
                            action: "mute",
                            muteHours: 8,
                          })
                        }
                      >
                        Mute 8h
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          actions.membershipMutation.mutate({
                            conversationId,
                            action: "mute",
                            muteHours: 24 * 7,
                          })
                        }
                      >
                        Mute 1w
                      </Button>
                    </>
                  )}
                  {filter === "archived" || selected?.member_archived ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        actions.membershipMutation.mutate({
                          conversationId,
                          action: "unarchive",
                        })
                      }
                    >
                      Unarchive
                    </Button>
                  ) : (
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
                  )}
                  {selected && selected.conversation_type !== "dm" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setRenameTitle(selected.title ?? "");
                        setShowRename(true);
                      }}
                    >
                      Rename
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    disabled={actions.membershipMutation.isPending}
                    onClick={() => {
                      actions.membershipMutation.mutate(
                        { conversationId, action: "leave" },
                        {
                          onSuccess: () => {
                            notify.success("Left conversation");
                            void navigate({
                              to: "/messages",
                              search: messagesSearch({ filter }),
                            });
                          },
                        },
                      );
                    }}
                  >
                    Leave
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setShowFiles((value) => !value)}
                  >
                    {showFiles ? "Hide files" : "Shared files"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setShowPinned((value) => !value)}
                  >
                    {showPinned ? "Hide pins" : "Pinned"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setShowMembers((value) => !value)}
                  >
                    {showMembers ? "Hide members" : "Members"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!messages.data?.length}
                    onClick={() => {
                      const title =
                        selected?.title ||
                        (selected?.conversation_type === "dm" ? "Direct message" : "Conversation");
                      const text = buildMessagingThreadExport({
                        title,
                        conversationId,
                        messages: messages.data ?? [],
                      });
                      downloadTextFile(
                        `messages-${conversationId.slice(0, 8)}.txt`,
                        text,
                      );
                      notify.success("Conversation exported");
                    }}
                  >
                    Export
                  </Button>
                  {selected &&
                  ["group", "channel", "hr_private", "accountant_client", "advisor_engagement"].includes(
                    selected.conversation_type,
                  ) ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setShowAddMembers(true);
                        void loadPeers("");
                      }}
                    >
                      Add members
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setShowAi((value) => !value)}
                  >
                    {showAi ? "Hide AI" : "AI assist"}
                  </Button>
                </div>
              </header>
              <div className="border-b px-4 py-2">
                <Label htmlFor="thread-search" className="sr-only">
                  Search in conversation
                </Label>
                <Input
                  id="thread-search"
                  value={threadSearch}
                  onChange={(e) => setThreadSearch(e.target.value)}
                  placeholder="Search in this conversation"
                  aria-label="Search in this conversation"
                />
                {threadSearch.trim().length >= 2 ? (
                  <div className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs">
                    {threadHits.isPending ? (
                      <p className="text-muted-foreground">Searching…</p>
                    ) : null}
                    {threadHits.data?.length === 0 ? (
                      <p className="text-muted-foreground">No matches</p>
                    ) : null}
                    {threadHits.data?.map((hit) => (
                      <button
                        key={hit.id}
                        type="button"
                        className="block w-full truncate rounded px-2 py-1 text-left hover:bg-muted/50"
                        onClick={() => {
                          const el = document.getElementById(`msg-${hit.id}`);
                          el?.scrollIntoView({ behavior: "smooth", block: "center" });
                        }}
                      >
                        <span className="font-medium">#{hit.seq}</span> {hit.body}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              {showFiles && companyId ? (
                <div className="border-b px-4 py-3">
                  <ConversationFiles companyId={companyId} conversationId={conversationId} />
                </div>
              ) : null}
              {showPinned && companyId ? (
                <div className="border-b px-4 py-3">
                  <ConversationPinned companyId={companyId} conversationId={conversationId} />
                </div>
              ) : null}
              {showMembers && companyId ? (
                <div className="border-b px-4 py-3">
                  <ConversationMembers
                    companyId={companyId}
                    conversationId={conversationId}
                    currentUserId={user?.id ?? null}
                    allowBlock={selected?.conversation_type === "dm"}
                    allowRemove={
                      Boolean(selected) &&
                      selected!.conversation_type !== "dm"
                    }
                  />
                </div>
              ) : null}
              {showAi ? (
                <div className="border-b space-y-3 px-4 py-3">
                  <MessagingAiAssistPanel
                    companyId={companyId}
                    conversationId={conversationId}
                    authorisedExcerpts={(messages.data ?? [])
                      .filter((m) => !m.is_redacted)
                      .map((m) => m.body)
                      .slice(-20)}
                    aiEnabled={Boolean(settings.data?.allow_ai_assist)}
                  />
                  <MessagingVoiceVideoPanel
                    allowVoiceVideo={Boolean(settings.data?.allow_voice_video)}
                  />
                </div>
              ) : null}
              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {messages.isPending && <LoadingState />}
                {messages.isError && (
                  <ErrorState
                    title="Could not load messages"
                    description="Retry to recover missed messages after reconnecting."
                    onRetry={() => void messages.refetch()}
                  />
                )}
                {!messages.isPending && messages.hasMoreOlder ? (
                  <div className="flex justify-center">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={messages.loadingOlder}
                      onClick={() => void messages.loadOlder()}
                    >
                      {messages.loadingOlder ? "Loading…" : "Load older messages"}
                    </Button>
                  </div>
                ) : null}
                {messages.data?.map((message) => (
                  <article
                    key={message.id}
                    id={`msg-${message.id}`}
                    className={cn(
                      "rounded-md border bg-background px-3 py-2",
                      highlightMessageId === message.id && "ring-2 ring-primary",
                    )}
                    aria-label={`Message from ${message.author_name ?? "member"}`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>
                        {message.author_name ?? "Member"}
                        {message.is_edited ? " · edited" : ""}
                        {message.is_pinned ? " · pinned" : ""}
                      </span>
                      <time dateTime={message.created_at}>
                        {new Date(message.created_at).toLocaleString()}
                      </time>
                    </div>
                    {message.reply_to_message_id ? (
                      <p className="mb-1 truncate rounded bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
                        Replying to message {message.reply_to_message_id.slice(0, 8)}…
                      </p>
                    ) : null}
                    <SafeMessageBody body={message.body} />
                    {companyId ? (
                      <MessageActions
                        companyId={companyId}
                        message={message}
                        canEdit={Boolean(user?.id && message.author_user_id === user.id)}
                        onReply={(target) => setReplyTo(target)}
                        onForward={(target) => setForwardMessage(target)}
                      />
                    ) : null}
                    {companyId && user?.id && message.author_user_id === user.id ? (
                      <div className="mt-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() =>
                            setReceiptMessageId((current) =>
                              current === message.id ? null : message.id,
                            )
                          }
                        >
                          {receiptMessageId === message.id ? "Hide receipts" : "Read receipts"}
                        </Button>
                        {receiptMessageId === message.id ? (
                          <MessageReceipts companyId={companyId} messageId={message.id} />
                        ) : null}
                      </div>
                    ) : null}
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
                  if (looksLikeInformalApproval(composer)) {
                    notify.warning(
                      "Chat text cannot approve accounting changes",
                      "Use Request formal review to create an Action Center item. Document state is unchanged.",
                    );
                  }
                  void handleSend();
                }}
              >
                {replyTo ? (
                  <div className="mb-2 flex items-start justify-between gap-2 rounded border bg-muted/30 px-3 py-2 text-xs">
                    <div className="min-w-0">
                      <p className="font-medium">
                        Replying to {replyTo.author_name ?? "member"}
                      </p>
                      <p className="truncate text-muted-foreground">{replyTo.body}</p>
                    </div>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setReplyTo(null)}>
                      Cancel
                    </Button>
                  </div>
                ) : null}
                <Label htmlFor="message-composer" className="sr-only">
                  Message
                </Label>
                <Textarea
                  id="message-composer"
                  value={composer}
                  onChange={(e) => {
                    setComposer(e.target.value);
                    void presence.signalTyping();
                  }}
                  onKeyDown={(event) => {
                    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                      event.preventDefault();
                      void handleSend();
                    }
                  }}
                  placeholder="Write a message. Use @ to mention people. Ctrl/⌘+Enter to send."
                  rows={3}
                  maxLength={8000}
                />
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setShowMentionPicker((value) => !value);
                        if (!peers.length) void loadPeers("");
                      }}
                    >
                      @ Mention
                    </Button>
                    <Label htmlFor="message-file" className="text-xs text-muted-foreground">
                      Attach file
                    </Label>
                    <Input
                      id="message-file"
                      type="file"
                      className="max-w-[220px]"
                      disabled={!conversationId || uploading}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (!file || !companyId || !conversationId) return;
                        setUploading(true);
                        void uploadMessagingAttachment({
                          file,
                          companyId,
                          conversationId,
                          maxBytes: settings.data?.max_attachment_bytes,
                          register: registerAttachment,
                        })
                          .then(() => {
                            notify.success("File shared securely");
                            setShowFiles(true);
                            void queryClient.invalidateQueries({
                              queryKey: ["messaging-attachments", companyId, conversationId],
                            });
                          })
                          .catch((error) => notify.error(error, "Could not share file"))
                          .finally(() => setUploading(false));
                      }}
                    />
                  </div>
                  <Button type="submit" disabled={sending || !composer.trim()}>
                    {sending ? "Sending…" : "Send"}
                  </Button>
                </div>
                {showMentionPicker ? (
                  <div className="mt-2 max-h-36 overflow-y-auto rounded border">
                    {peers.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-muted-foreground">
                        No eligible people found.
                      </p>
                    ) : (
                      peers.slice(0, 12).map((peer) => (
                        <button
                          key={peer.user_id}
                          type="button"
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-muted/50"
                          onClick={() => {
                            setComposer((prev) =>
                              insertMentionToken(prev, peer.full_name || peer.email || peer.user_id),
                            );
                            setShowMentionPicker(false);
                          }}
                        >
                          {peer.full_name || peer.email || peer.user_id}
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap items-end gap-2 border-t pt-3">
                  <div className="min-w-[200px] flex-1">
                    <Label htmlFor="approval-peer">Request formal review (assignee user id)</Label>
                    <Input
                      id="approval-peer"
                      value={approvalPeer}
                      onChange={(e) => setApprovalPeer(e.target.value)}
                      placeholder="UUID of assignee"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!conversationId || !approvalPeer.trim()}
                    onClick={() => {
                      if (!companyId || !conversationId) return;
                      void requestApproval({
                        data: {
                          companyId,
                          conversationId,
                          assigneeUserId: approvalPeer.trim(),
                          kind: "task_assignment",
                          recordType: "messaging_conversation",
                          recordId: conversationId,
                          note: "Formal review requested from Messages",
                          targetPath: `/messages?conversation=${conversationId}`,
                        },
                      })
                        .then(() =>
                          notify.success(
                            "Formal review requested",
                            "An Action Center item was created. Chat text did not approve anything.",
                          ),
                        )
                        .catch((error) => notify.error(error, "Could not request review"));
                    }}
                  >
                    Request formal review
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Messages are saved before success is shown. Typing “approved” never posts, pays or
                  authorises journals.
                </p>
              </form>
            </>
          )}
        </section>
      </div>

      {forwardMessage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Forward message"
          className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4"
        >
          <div className="w-full max-w-md rounded-lg border bg-card p-4 shadow-lg">
            <h3 className="text-base font-semibold">Forward message</h3>
            <p className="mt-1 truncate text-xs text-muted-foreground">{forwardMessage.body}</p>
            <ul className="mt-3 max-h-56 overflow-y-auto rounded border">
              {(conversations.data ?? [])
                .filter((c) => c.id !== conversationId)
                .slice(0, 20)
                .map((conversation) => (
                  <li key={conversation.id}>
                    <button
                      type="button"
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-muted/50"
                      onClick={() => {
                        void actions.sendMutation
                          .mutateAsync({
                            conversationId: conversation.id,
                            body: `Forwarded message:\n${forwardMessage.body}`,
                            idempotencyKey: crypto.randomUUID(),
                          })
                          .then(() => {
                            notify.success("Message forwarded");
                            setForwardMessage(null);
                            void navigate({
                              to: "/messages",
                              search: messagesSearch({
                                filter,
                                conversation: conversation.id,
                              }),
                            });
                          })
                          .catch((error) => notify.error(error, "Could not forward message"));
                      }}
                    >
                      {conversation.title ||
                        (conversation.conversation_type === "dm"
                          ? "Direct message"
                          : conversation.conversation_type)}
                    </button>
                  </li>
                ))}
            </ul>
            <div className="mt-4 flex justify-end">
              <Button type="button" variant="ghost" onClick={() => setForwardMessage(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {showRename && conversationId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Rename conversation"
          className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4"
        >
          <div className="w-full max-w-md rounded-lg border bg-card p-4 shadow-lg">
            <h3 className="text-base font-semibold">Rename conversation</h3>
            <div className="mt-3 space-y-2">
              <Label htmlFor="rename-title">Title</Label>
              <Input
                id="rename-title"
                value={renameTitle}
                maxLength={120}
                onChange={(event) => setRenameTitle(event.target.value)}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setShowRename(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!renameTitle.trim() || !companyId}
                onClick={() => {
                  if (!companyId || !conversationId) return;
                  void renameConversation({
                    data: {
                      companyId,
                      conversationId,
                      title: renameTitle,
                    },
                  })
                    .then(() => {
                      notify.success("Conversation renamed");
                      setShowRename(false);
                      void queryClient.invalidateQueries({
                        queryKey: ["messaging-conversations", companyId],
                      });
                    })
                    .catch((error) => notify.error(error, "Could not rename conversation"));
                }}
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      )}

      {showAddMembers && conversationId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Add members"
          className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4"
        >
          <div className="w-full max-w-md rounded-lg border bg-card p-4 shadow-lg">
            <h3 className="text-base font-semibold">Add members</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Only active organisation members can be invited. External invites stay off until
              isolation is verified.
            </p>
            <div className="mt-3 space-y-2">
              <Label htmlFor="add-member-search">Find people</Label>
              <Input
                id="add-member-search"
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
                        if (!companyId || !conversationId) return;
                        void addMembers({
                          data: {
                            companyId,
                            conversationId,
                            memberUserIds: [peer.user_id],
                          },
                        })
                          .then((result) => {
                            notify.success(
                              result.added > 0 ? "Member added" : "Already a member",
                            );
                            setShowAddMembers(false);
                          })
                          .catch((error) => notify.error(error, "Could not add member"));
                      }}
                    >
                      <span>
                        {peer.full_name || peer.email || peer.user_id}
                        <span className="block text-xs text-muted-foreground">{peer.email}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-4 flex justify-end">
              <Button type="button" variant="ghost" onClick={() => setShowAddMembers(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {showNew && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={
            showNew === "dm"
              ? "New direct message"
              : showNew === "group"
                ? "New group"
                : showNew === "channel"
                  ? "New channel"
                  : showNew === "hr"
                    ? "Private HR discussion"
                    : showNew === "accountant"
                      ? "Accountant discussion"
                      : "Advisor engagement"
          }
          className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4"
        >
          <div className="w-full max-w-md rounded-lg border bg-card p-4 shadow-lg">
            <h3 className="text-base font-semibold">
              {showNew === "dm"
                ? "New direct message"
                : showNew === "group"
                  ? "New group"
                  : showNew === "channel"
                    ? "New channel"
                    : showNew === "hr"
                      ? "Private HR discussion"
                      : showNew === "accountant"
                        ? "Accountant discussion"
                        : "Advisor engagement"}
            </h3>
            {(showNew === "group" ||
              showNew === "channel" ||
              showNew === "hr" ||
              showNew === "advisor" ||
              showNew === "accountant") && (
              <div className="mt-3 space-y-2">
                <Label htmlFor="group-title">Title</Label>
                <Input
                  id="group-title"
                  value={groupTitle}
                  onChange={(e) => setGroupTitle(e.target.value)}
                  maxLength={120}
                  placeholder={
                    showNew === "hr"
                      ? "Leave / payroll query"
                      : showNew === "advisor"
                        ? "Engagement discussion"
                        : showNew === "accountant"
                          ? "Client discussion"
                          : showNew === "channel"
                            ? "Channel name"
                            : "Group name"
                  }
                />
              </div>
            )}
            {showNew === "channel" ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Channels are internal announcement-style spaces. Membership is still required to
                read and post.
              </p>
            ) : null}
            {showNew === "hr" ? (
              <p className="mt-3 text-xs text-muted-foreground">
                HR-private visibility. Payroll and sensitive personal data stay out of general
                channels.
              </p>
            ) : null}
            {showNew === "accountant" ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Accountant–client visibility. Firm multi-client isolation remains enforced by
                membership and RLS.
              </p>
            ) : null}
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
                        if (showNew === "hr" && companyId) {
                          void openHr({
                            data: {
                              companyId,
                              title: groupTitle || "Private HR discussion",
                              peerUserId: peer.user_id,
                            },
                          })
                            .then((result) => {
                              setShowNew(null);
                              setGroupTitle("");
                              void navigate({
                                to: "/messages",
                                search: messagesSearch({
                                  filter: "inbox",
                                  conversation: result.conversationId,
                                }),
                              });
                            })
                            .catch((error) => notify.error(error, "Could not open HR discussion"));
                          return;
                        }
                        if (showNew === "advisor" && companyId) {
                          void openAdvisor({
                            data: {
                              companyId,
                              title: groupTitle || "Advisor engagement",
                              peerUserId: peer.user_id,
                            },
                          })
                            .then((result) => {
                              setShowNew(null);
                              setGroupTitle("");
                              void navigate({
                                to: "/messages",
                                search: messagesSearch({
                                  filter: "transactions",
                                  conversation: result.conversationId,
                                }),
                              });
                            })
                            .catch((error) =>
                              notify.error(error, "Could not open advisor conversation"),
                            );
                          return;
                        }
                        if (showNew === "accountant" && companyId) {
                          void openAccountant({
                            data: {
                              companyId,
                              title: groupTitle || "Accountant discussion",
                              peerUserId: peer.user_id,
                            },
                          })
                            .then((result) => {
                              setShowNew(null);
                              setGroupTitle("");
                              void navigate({
                                to: "/messages",
                                search: messagesSearch({
                                  filter: "transactions",
                                  conversation: result.conversationId,
                                }),
                              });
                            })
                            .catch((error) =>
                              notify.error(error, "Could not open accountant conversation"),
                            );
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
                      {(showNew === "group" || showNew === "channel") &&
                        selectedPeers.includes(peer.user_id) && <Badge>Selected</Badge>}
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
              {showNew === "channel" && (
                <Button
                  type="button"
                  disabled={!groupTitle.trim() || actions.channelMutation.isPending}
                  onClick={() =>
                    actions.channelMutation.mutate(
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
                  Create channel
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </ListWorkspace>
  );
}
