import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { LoadingState, EmptyState } from "@/components/common/states";
import { listMessagingAttachments } from "@/lib/messaging/messaging.functions";
import { createMessagingAttachmentSignedUrl } from "@/lib/messaging/upload-client";
import { notify } from "@/lib/notify";

type AttachmentRow = {
  id: string;
  file_name: string;
  mime_type: string;
  byte_size: number;
  storage_path: string;
  created_at: string;
};

export function ConversationFiles({
  companyId,
  conversationId,
}: {
  companyId: string;
  conversationId: string;
}) {
  const list = useServerFn(listMessagingAttachments);
  const query = useQuery({
    queryKey: ["messaging-attachments", companyId, conversationId],
    queryFn: async () =>
      (await list({
        data: { companyId, conversationId },
      })) as AttachmentRow[],
  });

  if (query.isPending) return <LoadingState rows={2} />;
  if (query.isError) {
    return <QueryErrorState queries={[query]} title="Could not load shared files" />;
  }
  if (!query.isSuccess) return <LoadingState rows={2} />;
  if (!query.data?.length) {
    return (
      <EmptyState
        title="No shared files"
        description="Attachments shared in this conversation appear here."
        compact
      />
    );
  }

  return (
    <ul className="space-y-2" aria-label="Shared files">
      {query.data.map((file) => (
        <li
          key={file.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
        >
          <div className="min-w-0">
            <p className="truncate font-medium">{file.file_name}</p>
            <p className="text-xs text-muted-foreground">
              {file.mime_type} · {Math.max(1, Math.round(file.byte_size / 1024))} KB ·{" "}
              {new Date(file.created_at).toLocaleString()}
            </p>
          </div>
          <div className="flex gap-2">
            {file.mime_type.startsWith("image/") ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  void createMessagingAttachmentSignedUrl(file.storage_path)
                    .then((url) => window.open(url, "_blank", "noopener,noreferrer"))
                    .catch((error) => notify.error(error, "Could not open preview"));
                }}
              >
                Preview
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                void createMessagingAttachmentSignedUrl(file.storage_path, file.file_name)
                  .then((url) => {
                    const anchor = document.createElement("a");
                    anchor.href = url;
                    anchor.download = file.file_name;
                    anchor.rel = "noopener";
                    document.body.appendChild(anchor);
                    anchor.click();
                    anchor.remove();
                  })
                  .catch((error) => notify.error(error, "Could not download file"));
              }}
            >
              Download
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
