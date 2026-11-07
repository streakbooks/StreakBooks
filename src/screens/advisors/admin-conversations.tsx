import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdvisorsSubnav } from "@/components/advisors/AdvisorsSubnav";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  getAdvisorsConversation,
  listAdvisorsConversations,
  listAdvisorsStaff,
  updateAdvisorsConversation,
} from "@/lib/advisors/management.functions";
import { staffLabel, type AdvisorsConversationStatus } from "@/lib/advisors/management";
import { friendlyAuthError } from "@/lib/auth-helpers";

const STATUSES: Array<AdvisorsConversationStatus | "all"> = ["all", "open", "handed_off", "closed"];

export function AdvisorsAdminConversationsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listAdvisorsConversations);
  const loadDetail = useServerFn(getAdvisorsConversation);
  const listStaff = useServerFn(listAdvisorsStaff);
  const update = useServerFn(updateAdvisorsConversation);
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");
  const [search, setSearch] = useState("");
  const [reason, setReason] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState("");

  const staffQuery = useQuery({
    queryKey: ["advisors-staff"],
    queryFn: () => listStaff(),
    retry: false,
  });
  const query = useQuery({
    queryKey: ["advisors-conversations", status, search],
    queryFn: () =>
      list({
        data: {
          status: status === "all" ? undefined : status,
          search: search || undefined,
        },
      }),
    retry: false,
  });
  const detailQuery = useQuery({
    queryKey: ["advisors-conversation", selectedId],
    queryFn: () => loadDetail({ data: { conversationId: selectedId! } }),
    enabled: Boolean(selectedId),
    retry: false,
  });

  const updateM = useMutation({
    mutationFn: (input: {
      conversationId: string;
      status?: AdvisorsConversationStatus;
      assignedAdvisorId?: string | null;
      adminNotes?: string;
    }) =>
      update({
        data: {
          ...input,
          reason: reason || "Updated conversation from Advisors console",
        },
      }),
    onSuccess: async () => {
      toast.success("Conversation updated");
      setReason("");
      await qc.invalidateQueries({ queryKey: ["advisors-conversations"] });
      await qc.invalidateQueries({ queryKey: ["advisors-conversation", selectedId] });
      await qc.invalidateQueries({ queryKey: ["advisors-overview"] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (query.isPending || staffQuery.isPending) return <LoadingState />;
  if (query.isError) {
    return (
      <main className="mx-auto max-w-6xl space-y-6 p-6">
        <ListWorkspace title="Conversations" description="Review Advisors qualification chats.">
        <ErrorState
          title="Conversations unavailable"
          description={friendlyAuthError(query.error)}
          onRetry={() => void query.refetch()}
        />
          </ListWorkspace>
  </main>
    );
  }

  const staff = staffQuery.data ?? [];
  const detail = detailQuery.data;

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <ListWorkspace
        title="Conversations"
        description="Open chat transcripts, assign advisors and close or hand off conversations."
       subnav={<AdvisorsSubnav />}>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="conversation-search">Search</Label>
          <Input
            id="conversation-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Visitor name or email"
            className="w-64"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="conversation-status">Status</Label>
          <select
            id="conversation-status"
            className="flex h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={status}
            onChange={(event) => setStatus(event.target.value as (typeof STATUSES)[number])}
          >
            {STATUSES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[16rem] flex-1 space-y-1">
          <Label htmlFor="conversation-reason">Change reason</Label>
          <Input
            id="conversation-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why are you updating this conversation?"
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <section className="space-y-2">
          {query.data.length === 0 ? (
            <EmptyState
              title="No conversations match"
              description="Visitor chats from service selection appear here after consent."
            />
          ) : (
            query.data.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => {
                  setSelectedId(conversation.id);
                  setAdminNotes(conversation.adminNotes);
                }}
                className={`w-full rounded-xl border p-4 text-left transition ${
                  selectedId === conversation.id
                    ? "border-primary bg-primary/5"
                    : "border-border/70 hover:border-primary/40"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {conversation.visitorName || conversation.visitorEmail || "Anonymous visitor"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {conversation.serviceCode} · {conversation.messageCount} messages
                    </p>
                  </div>
                  <Badge variant="secondary">{conversation.status}</Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {staffLabel(staff, conversation.assignedAdvisorId)} ·{" "}
                  {new Date(conversation.lastMessageAt || conversation.createdAt).toLocaleString()}
                </p>
              </button>
            ))
          )}
        </section>

        <section className="space-y-4 rounded-xl border border-border/70 p-4">
          {!selectedId ? (
            <EmptyState
              title="Select a conversation"
              description="Choose a chat to read the transcript and update ownership."
            />
          ) : detailQuery.isPending ? (
            <LoadingState />
          ) : detailQuery.isError ? (
            <ErrorState
              title="Conversation detail unavailable"
              description={friendlyAuthError(detailQuery.error)}
              onRetry={() => void detailQuery.refetch()}
            />
          ) : detail ? (
            <>
              <div>
                <h2 className="font-semibold">
                  {detail.visitorName || detail.visitorEmail || "Anonymous visitor"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {detail.serviceCode}
                  {detail.recommendedPlanCode ? ` · recommended ${detail.recommendedPlanCode}` : ""}
                </p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="conversation-assign">Assigned advisor</Label>
                <select
                  id="conversation-assign"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={detail.assignedAdvisorId ?? ""}
                  onChange={(event) =>
                    updateM.mutate({
                      conversationId: detail.id,
                      assignedAdvisorId: event.target.value || null,
                    })
                  }
                >
                  <option value="">Unassigned</option>
                  {staff.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.displayName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-2">
                {(["open", "handed_off", "closed"] as const).map((next) => (
                  <Button
                    key={next}
                    type="button"
                    size="sm"
                    variant={detail.status === next ? "default" : "outline"}
                    disabled={updateM.isPending}
                    onClick={() => updateM.mutate({ conversationId: detail.id, status: next })}
                  >
                    Mark {next}
                  </Button>
                ))}
              </div>
              <div className="max-h-[24rem] space-y-3 overflow-y-auto rounded-lg border border-border/50 p-3">
                {detail.messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No messages stored yet.</p>
                ) : (
                  detail.messages.map((message) => (
                    <article key={message.id} className="space-y-1 text-sm">
                      <p className="text-xs tracking-wide text-muted-foreground uppercase">
                        {message.role} · {new Date(message.createdAt).toLocaleString()}
                      </p>
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    </article>
                  ))
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="conversation-notes">Admin notes</Label>
                <Textarea
                  id="conversation-notes"
                  value={adminNotes}
                  onChange={(event) => setAdminNotes(event.target.value)}
                  rows={3}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={updateM.isPending}
                  onClick={() => updateM.mutate({ conversationId: detail.id, adminNotes })}
                >
                  Save notes
                </Button>
              </div>
    </ListWorkspace>
            </>
          ) : null}
        </section>
      </div>
        </ListWorkspace>
  </main>
  );
}
