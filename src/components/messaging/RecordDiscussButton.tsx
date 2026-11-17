import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openRecordDiscussion } from "@/lib/messaging/messaging.functions";
import { notify } from "@/lib/notify";
import type { MessagingVisibility } from "@/lib/messaging/types";

/** Opens or creates an authorised record-linked conversation. */
export function RecordDiscussButton({
  companyId,
  recordType,
  recordId,
  title,
  visibility = "internal",
  label = "Discuss",
}: {
  companyId: string | null;
  recordType: string;
  recordId: string;
  title?: string;
  visibility?: MessagingVisibility;
  label?: string;
}) {
  const navigate = useNavigate();
  const open = useServerFn(openRecordDiscussion);
  const [pending, setPending] = useState(false);
  const mutation = useMutation({
    mutationFn: () =>
      open({
        data: {
          companyId: companyId!,
          recordType,
          recordId,
          visibility,
          ...(title ? { title } : {}),
        },
      }),
    onSuccess: (result) => {
      void navigate({
        to: "/messages",
        search: {
          filter: "transactions",
          ...(result.conversationId ? { conversation: result.conversationId } : {}),
        },
      });
    },
    onError: (error) => notify.error(error, "Could not open discussion"),
    onSettled: () => setPending(false),
  });

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={!companyId || pending || mutation.isPending}
      onClick={() => {
        setPending(true);
        mutation.mutate();
      }}
    >
      <MessageSquare className="size-4" aria-hidden />
      {label}
    </Button>
  );
}
