import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  editMessagingMessage,
  pinMessagingMessage,
  reactMessagingMessage,
  redactMessagingMessage,
  starMessagingMessage,
} from "@/lib/messaging/messaging.functions";
import { notify } from "@/lib/notify";
import type { MessagingMessage } from "@/lib/messaging/types";

const QUICK_REACTIONS = ["👍", "👀", "✅"] as const;

export function MessageActions({
  companyId,
  message,
  canEdit,
}: {
  companyId: string;
  message: MessagingMessage;
  canEdit: boolean;
}) {
  const client = useQueryClient();
  const edit = useServerFn(editMessagingMessage);
  const redact = useServerFn(redactMessagingMessage);
  const react = useServerFn(reactMessagingMessage);
  const pin = useServerFn(pinMessagingMessage);
  const star = useServerFn(starMessagingMessage);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.body);

  const invalidate = () => {
    void client.invalidateQueries({
      queryKey: ["messaging-messages", companyId, message.conversation_id],
    });
  };

  const editMutation = useMutation({
    mutationFn: () =>
      edit({ data: { companyId, messageId: message.id, body: draft } }),
    onSuccess: () => {
      setEditing(false);
      invalidate();
      notify.success("Message updated");
    },
    onError: (error) => notify.error(error, "Could not edit message"),
  });

  const redactMutation = useMutation({
    mutationFn: () => redact({ data: { companyId, messageId: message.id } }),
    onSuccess: () => {
      invalidate();
      notify.success("Message removed");
    },
    onError: (error) => notify.error(error, "Could not remove message"),
  });

  const reactMutation = useMutation({
    mutationFn: (emoji: string) =>
      react({ data: { companyId, messageId: message.id, emoji } }),
    onSuccess: () => invalidate(),
    onError: (error) => notify.error(error, "Could not react"),
  });

  const pinMutation = useMutation({
    mutationFn: () =>
      pin({ data: { companyId, messageId: message.id, pinned: !message.is_pinned } }),
    onSuccess: () => {
      invalidate();
      notify.success(message.is_pinned ? "Message unpinned" : "Message pinned");
    },
    onError: (error) => notify.error(error, "Could not update pin"),
  });

  const starMutation = useMutation({
    mutationFn: () => star({ data: { companyId, messageId: message.id, starred: true } }),
    onSuccess: () => notify.success("Message starred"),
    onError: (error) => notify.error(error, "Could not star message"),
  });

  if (message.is_redacted) return null;

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap gap-1">
        {QUICK_REACTIONS.map((emoji) => (
          <Button
            key={emoji}
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            aria-label={`React ${emoji}`}
            disabled={reactMutation.isPending}
            onClick={() => reactMutation.mutate(emoji)}
          >
            {emoji}
          </Button>
        ))}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7"
          onClick={() => {
            void navigator.clipboard
              .writeText(message.body)
              .then(() => notify.success("Copied to clipboard"))
              .catch(() => notify.error(new Error("Clipboard unavailable"), "Could not copy"));
          }}
        >
          Copy
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7"
          disabled={pinMutation.isPending}
          onClick={() => pinMutation.mutate()}
        >
          {message.is_pinned ? "Unpin" : "Pin"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7"
          disabled={starMutation.isPending}
          onClick={() => starMutation.mutate()}
        >
          Star
        </Button>
        {canEdit ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={() => {
                setDraft(message.body);
                setEditing((value) => !value);
              }}
            >
              Edit
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-destructive"
              disabled={redactMutation.isPending}
              onClick={() => redactMutation.mutate()}
            >
              Remove
            </Button>
          </>
        ) : null}
      </div>
      {editing ? (
        <div className="flex flex-wrap gap-2">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-label="Edit message"
            maxLength={8000}
          />
          <Button
            type="button"
            size="sm"
            disabled={editMutation.isPending || !draft.trim()}
            onClick={() => editMutation.mutate()}
          >
            Save
          </Button>
        </div>
      ) : null}
    </div>
  );
}
