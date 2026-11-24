import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardCopy, DownloadCloud, Inbox, Loader2, Mail, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useCan } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { ATTACHMENT_ENTITIES, formatFileSize } from "@/lib/documents/attachments";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import {
  createDocumentInbox,
  getDocumentInbox,
  getDocumentInboxAttachments,
  importDocumentInboxAttachment,
  listDocumentInboxMessages,
  setDocumentInboxEnabled,
} from "@/lib/documents/email-inbox.functions";
import { Button } from "@/components/ui/button";

/** Provider credentials and raw e-mail bodies stay on the server. */
export function DocumentEmailInbox({
  companyId,
  onClose,
}: {
  companyId: string;
  onClose: () => void;
}) {
  const { can } = useCan();
  const canManage = ATTACHMENT_ENTITIES.company.manage.some((permission) => can(permission));
  const client = useQueryClient();
  const loadSettings = useServerFn(getDocumentInbox);
  const createInbox = useServerFn(createDocumentInbox);
  const setEnabled = useServerFn(setDocumentInboxEnabled);
  const listEmails = useServerFn(listDocumentInboxMessages);
  const loadAttachments = useServerFn(getDocumentInboxAttachments);
  const importFile = useServerFn(importDocumentInboxAttachment);

  const [cursor, setCursor] = useState<string | null>(null);
  const [previousCursors, setPreviousCursors] = useState<Array<string | null>>([]);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);

  const settings = useQuery({
    queryKey: ["document-email-inbox", companyId],
    queryFn: () => loadSettings({ data: { companyId } }),
  });
  const ready = Boolean(
    settings.isSuccess && settings.data?.configured && settings.data?.enabled,
  );
  const emails = useQuery({
    queryKey: ["document-email-messages", companyId, cursor],
    enabled: ready,
    queryFn: () => listEmails({ data: { companyId, ...(cursor ? { after: cursor } : {}) } }),
    retry: false,
  });
  const attachments = useQuery({
    queryKey: ["document-email-attachments", companyId, selectedEmailId],
    enabled: ready && Boolean(selectedEmailId),
    queryFn: () => loadAttachments({ data: { companyId, emailId: selectedEmailId! } }),
    retry: false,
  });

  const refreshInbox = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["document-email-inbox", companyId] }),
      client.invalidateQueries({ queryKey: ["document-email-messages", companyId] }),
    ]);
  };
  const create = useMutation({
    mutationFn: () => createInbox({ data: { companyId } }),
    onSuccess: async () => {
      await refreshInbox();
      toast.success("Private receiving address created. Activate it before importing.");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  const toggle = useMutation({
    mutationFn: (enabled: boolean) => setEnabled({ data: { companyId, enabled } }),
    onSuccess: async (result) => {
      setCursor(null);
      setPreviousCursors([]);
      setSelectedEmailId(null);
      await refreshInbox();
      toast.success(result.enabled ? "Email inbox activated" : "Email inbox paused");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  const importer = useMutation({
    mutationFn: (attachmentId: string) => {
      if (!selectedEmailId) throw new Error("Choose an email first");
      return importFile({ data: { companyId, emailId: selectedEmailId, attachmentId } });
    },
    onSuccess: async (result) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["document-email-attachments", companyId] }),
        client.invalidateQueries({ queryKey: ["document-review-queue", companyId] }),
        client.invalidateQueries({ queryKey: ["company-files", companyId] }),
      ]);
      toast.success(
        result.alreadyImported ? "File was already imported" : "File added to document review",
      );
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  return (
    <section className="space-y-4" aria-label="Email-to-Inbox workspace">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Inbox className="size-5" /> Email-to-Inbox
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Forward supplier invoices and receipts to a private StreakBooks receiving address. Review
            and import selected attachments manually. Imports do not create or post accounting
            entries.
          </p>
        </div>
        <Button variant="outline" onClick={onClose}>
          Back to Files
        </Button>
      </div>

      {settings.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading inbox settings…
        </p>
      ) : settings.isError ? (
        <QueryErrorState queries={[settings]} title="Could not load inbox settings" />
      ) : settings.data ? (
        <div className="rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-medium">Receiving address</h3>
              {settings.data.address ? (
                <p className="mt-1 break-all font-mono text-sm">{settings.data.address}</p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  {settings.data.configured
                    ? "Create an address for this organisation."
                    : "Inbound email provider configuration is not active."}
                </p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Provider: {settings.data.provider ?? "Not configured"} ·{" "}
                {settings.data.enabled ? "Receiving enabled" : "Receiving paused"}
              </p>
              {!settings.data.configured ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Platform administrator must configure{" "}
                  {settings.data.missingConfiguration.join(" and ")} on the server.
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {settings.data.address ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(settings.data!.address!).then(
                      () => toast.success("Inbox address copied"),
                      () => toast.error("Clipboard permission denied"),
                    );
                  }}
                >
                  <ClipboardCopy className="mr-1 size-4" /> Copy address
                </Button>
              ) : null}
              {!settings.data.address && canManage && settings.data.configured ? (
                <Button
                  size="sm"
                  disabled={create.isPending || !settings.isSuccess || settings.isError}
                  onClick={() => create.mutate()}
                >
                  Create inbox
                </Button>
              ) : null}
              {settings.data.address && canManage ? (
                <Button
                  size="sm"
                  variant={settings.data.enabled ? "outline" : "default"}
                  disabled={
                    toggle.isPending ||
                    !settings.data.configured ||
                    !settings.isSuccess ||
                    settings.isError
                  }
                  onClick={() => toggle.mutate(!settings.data!.enabled)}
                >
                  {settings.data.enabled ? "Pause inbox" : "Activate inbox"}
                </Button>
              ) : null}
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Keep existing HostGator or other business mailbox settings unchanged. Configure
            forwarding of selected messages to this receiving address; do not replace your primary
            domain MX records. The receiving address only works after provider-domain setup,
            activation, and a successful end-to-end test.
          </p>
        </div>
      ) : null}

      {ready ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 font-semibold">
              <Mail className="size-4" /> Received messages
            </h3>
            <Button
              size="sm"
              variant="outline"
              disabled={emails.isFetching}
              onClick={() => void emails.refetch()}
            >
              {emails.isFetching ? (
                <Loader2 className="mr-1 size-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 size-4" />
              )}
              Check inbox
            </Button>
          </div>
          {emails.isError ? (
            <QueryErrorState queries={[emails]} title="Could not load document email inbox" />
          ) : emails.isPending ? (
            <p role="status" className="text-sm text-muted-foreground">
              Checking incoming email…
            </p>
          ) : (
            <>
              <div className="space-y-2">
                {emails.data.rows.length ? (
                  emails.data.rows.map((email) => (
                    <div
                      key={email.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                    >
                      <div className="min-w-0">
                        <p className="break-words text-sm font-medium">{email.subject}</p>
                        <p className="break-all text-xs text-muted-foreground">
                          From: {email.from} · Received: {email.receivedAt}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant={selectedEmailId === email.id ? "default" : "outline"}
                        onClick={() =>
                          setSelectedEmailId(selectedEmailId === email.id ? null : email.id)
                        }
                      >
                        {selectedEmailId === email.id ? "Close attachments" : "View attachments"}
                      </Button>
                    </div>
                  ))
                ) : (
                  <p className="rounded-lg border p-4 text-sm text-muted-foreground">
                    No messages addressed to this organisation were found in the current provider
                    page. Check forwarding or browse older messages.
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>Scanned {emails.data.scanned} provider messages in this page.</span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!previousCursors.length}
                    onClick={() => {
                      const previous = previousCursors.at(-1) ?? null;
                      setPreviousCursors((items) => items.slice(0, -1));
                      setCursor(previous);
                      setSelectedEmailId(null);
                    }}
                  >
                    Newer
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!emails.data.nextCursor}
                    onClick={() => {
                      if (!emails.data.nextCursor) return;
                      setPreviousCursors((items) => [...items, cursor]);
                      setCursor(emails.data.nextCursor);
                      setSelectedEmailId(null);
                    }}
                  >
                    Older
                  </Button>
                </div>
              </div>
            </>
          )}

          {selectedEmailId ? (
            <div className="space-y-3 rounded-lg border p-4">
              <h3 className="font-semibold">Email attachments</h3>
              {attachments.isPending ? (
                <p role="status" className="text-sm text-muted-foreground">
                  Loading attachments…
                </p>
              ) : attachments.isError ? (
                <QueryErrorState queries={[attachments]} title="Could not load email attachments" />
              ) : !attachments.isSuccess ? (
                <p role="status" className="text-sm text-muted-foreground">
                  Loading attachments…
                </p>
              ) : attachments.data.rows.length ? (
                attachments.data.rows.map((file) => (
                  <div
                    key={file.id}
                    className="flex flex-wrap items-center justify-between gap-3 border-b py-2 last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="break-all text-sm font-medium">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(file.sizeBytes)} · {file.contentType || "Unknown type"}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={
                        file.imported ||
                        importer.isPending ||
                        !canManage ||
                        !attachments.isSuccess ||
                        attachments.isError
                      }
                      onClick={() => importer.mutate(file.id)}
                    >
                      {importer.isPending ? (
                        <Loader2 className="mr-1 size-4 animate-spin" />
                      ) : (
                        <DownloadCloud className="mr-1 size-4" />
                      )}
                      {file.imported ? "Already imported" : "Import to review"}
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">This email has no attachments.</p>
              )}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
