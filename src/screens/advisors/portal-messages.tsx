import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdvisorsPortalSubnav } from "@/components/advisors/AdvisorsPortalSubnav";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  listAdvisorsPortalMessages,
  sendAdvisorsPortalMessage,
} from "@/lib/advisors/portal.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";

export function AdvisorsPortalMessagesPage() {
  const qc = useQueryClient();
  const list = useServerFn(listAdvisorsPortalMessages);
  const send = useServerFn(sendAdvisorsPortalMessage);
  const [body, setBody] = useState("");

  const query = useQuery({
    queryKey: ["advisors-portal-messages"],
    queryFn: () => list(),
    retry: false,
  });

  const sendM = useMutation({
    mutationFn: () => send({ data: { body } }),
    onSuccess: async () => {
      toast.success("Message sent");
      setBody("");
      await qc.invalidateQueries({ queryKey: ["advisors-portal-messages"] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (query.isPending)
    return (
      <main className="mx-auto max-w-5xl space-y-6 p-6">
        <ListWorkspace title="Messages" description="Talk with your advisor.">
          <AdvisorsPortalSubnav />
          <div role="status" aria-live="polite">
            <LoadingState />
          </div>
        </ListWorkspace>
      </main>
    );
  if (query.isError) {
    return (
      <main className="mx-auto max-w-5xl space-y-6 p-6">
        <ListWorkspace title="Messages" description="Talk with your advisor.">
          <AdvisorsPortalSubnav />
          <div role="alert">
            <ErrorState
              title="Messages unavailable"
              description={friendlyAuthError(query.error)}
              onRetry={() => void query.refetch()}
            />
          </div>
        </ListWorkspace>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <ListWorkspace title="Messages" description="Secure thread with your assigned Advisors team.">
        <AdvisorsPortalSubnav />
        <form
          id="advisors-portal-compose"
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            sendM.mutate();
          }}
        >
          <Textarea
            id="advisors-portal-message"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Write a message to your advisor"
            rows={4}
            maxLength={5000}
            aria-label="Message to your advisor"
            required
          />
          <Button
            type="submit"
            disabled={sendM.isPending || body.trim().length < 1 || body.length > 5000}
          >
            {sendM.isPending ? "Sending…" : "Send message"}
          </Button>
        </form>
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          {query.data.length} messages
        </p>
        {query.data.length === 0 ? (
          <EmptyState
            title="No messages yet"
            description="Start the conversation above."
            action={
              <Button
                size="sm"
                type="button"
                onClick={() => {
                  document
                    .getElementById("advisors-portal-compose")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  document.getElementById("advisors-portal-message")?.focus();
                }}
              >
                Write a message
              </Button>
            }
          />
        ) : (
          <ul className="space-y-3">
            {query.data.map((item) => (
              <li key={item.id} className="rounded-lg border border-border p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {item.authorRole} · {new Date(item.createdAt).toLocaleString()}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{item.body}</p>
              </li>
            ))}
          </ul>
        )}
      </ListWorkspace>
    </main>
  );
}
