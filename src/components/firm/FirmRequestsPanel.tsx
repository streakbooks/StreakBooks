import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { getFirmClientName, type FirmClientRow } from "@/lib/firm/client-portfolio";
import {
  cancelFirmTrackedRequest,
  completeFirmTrackedRequest,
  createFirmTrackedRequest,
  listFirmEligibleAttachments,
  listFirmRequestRecipients,
  listFirmTrackedRequests,
  type TrackedDocumentRequest,
} from "@/lib/firm/firm-requests.functions";
import { LookupSelect } from "@/components/lookup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { LoadingState, EmptyState } from "@/components/common/states";
import { StatusBadge } from "@/components/common/StatusBadge";
import { firmRequestVisualStatus } from "@/lib/firm/request-visual-status";

function RequestCompletion({
  firmId,
  companyId,
  request,
  onUpdated,
}: {
  firmId: string;
  companyId: string;
  request: TrackedDocumentRequest;
  onUpdated: () => Promise<unknown>;
}) {
  const list = useServerFn(listFirmEligibleAttachments);
  const complete = useServerFn(completeFirmTrackedRequest);
  const [selected, setSelected] = useState("");
  const files = useQuery({
    queryKey: ["firm-request-documents", request.request_id],
    queryFn: () => list({ data: { firmId, companyId, requestId: request.request_id } }),
  });
  const options = files.data ?? [];
  const fileId = options.some((f) => f.id === selected) ? selected : (options[0]?.id ?? "");
  const update = useMutation({
    mutationFn: () =>
      complete({
        data: {
          firmId,
          companyId,
          requestId: request.request_id,
          attachmentId: fileId,
        },
      }),
    onSuccess: async () => {
      await onUpdated();
      toast.success("Document supplied for this request");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  if (files.isPending) return <LoadingState rows={1} />;
  if (files.isError)
    return (
      <QueryErrorState queries={[files]} title="Could not load eligible documents" />
    );
  return (
    <div className="mt-3 space-y-2 rounded-md border bg-muted/20 p-3">
      <p className="text-sm text-muted-foreground">
        Upload a company-level file in the existing client Documents workspace, then select it here.
        Only files you uploaded after the request was created are eligible.
      </p>
      {options.length === 0 ? (
        <p className="text-sm text-muted-foreground">No eligible uploaded company files yet.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <div className="min-w-52 flex-1">
            <RecordLookupSelect required value={fileId} onValueChange={setSelected}>
              <SelectTrigger aria-label="Document to fulfil request">
                <SelectValue placeholder="Choose uploaded document" />
              </SelectTrigger>
              <SelectContent>
                {options.map((file) => (
                  <SelectItem key={file.id} value={file.id}>
                    {file.file_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </RecordLookupSelect>
          </div>
          <Button disabled={!fileId || update.isPending} onClick={() => update.mutate()}>
            Mark fulfilled with document
          </Button>
        </div>
      )}
    </div>
  );
}

function RequestStatus({ request }: { request: TrackedDocumentRequest }) {
  return (
    <StatusBadge status={firmRequestVisualStatus(request, new Date().toISOString().slice(0, 10))} />
  );
}

export function FirmRequestsPanel({
  firmId,
  clients,
  canManage,
}: {
  firmId: string;
  clients: FirmClientRow[];
  canManage: boolean;
}) {
  const accessible = clients.filter((c) => Boolean(c.companies));
  const [selection, setSelection] = useState("");
  const companyId = accessible.some((c) => c.company_id === selection)
    ? selection
    : (accessible[0]?.company_id ?? "");
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [instructions, setInstructions] = useState("");
  const [dueDate, setDueDate] = useState(new Date().toISOString().slice(0, 10));
  const load = useServerFn(listFirmTrackedRequests);
  const loadRecipients = useServerFn(listFirmRequestRecipients);
  const create = useServerFn(createFirmTrackedRequest);
  const cancel = useServerFn(cancelFirmTrackedRequest);
  const qc = useQueryClient();
  const queryKey = ["firm-document-requests", firmId, companyId];
  const requestsQ = useQuery({
    queryKey,
    enabled: Boolean(companyId),
    queryFn: () => load({ data: { firmId, companyId } }),
  });
  const recipientsQ = useQuery({
    queryKey: ["firm-request-recipients", firmId, companyId],
    enabled: Boolean(companyId && canManage),
    queryFn: () => loadRecipients({ data: { firmId, companyId } }),
  });
  const recipients = recipientsQ.data ?? [];
  const requestedFrom = recipients.some((c) => c.user_id === recipient)
    ? recipient
    : (recipients[0]?.user_id ?? "");
  const createM = useMutation({
    mutationFn: () =>
      create({
        data: {
          firmId,
          companyId,
          requestedFrom,
          subject,
          instructions,
          dueDate,
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey });
      setSubject("");
      setInstructions("");
      toast.success("Secure document request created");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  const cancelM = useMutation({
    mutationFn: (requestId: string) => cancel({ data: { firmId, companyId, requestId } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey });
      toast.success("Request cancelled");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  const refresh = () => qc.invalidateQueries({ queryKey });
  return (
    <section aria-label="Firm document requests" className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Client document requests</h2>
        <p className="text-sm text-muted-foreground">
          The existing StreakBooks secure document-request workflow handles permissions, file
          provenance, completion and audit notifications. Requests shown are those visible to your
          signed-in account. Automated reminders appear in the recipient's notification centre; no
          emails are sent.
        </p>
      </div>
      {!companyId ? (
        <EmptyState
          title="No linked clients"
          description="Link an organisation before requesting documents."
        />
      ) : (
        <>
          <div className="max-w-md space-y-1">
            <Label>Client organisation</Label>
            <LookupSelect
              ariaLabel="Client for document requests"
              allowClear={false}
              value={companyId}
              onChange={(id) => {
                setSelection(id);
                setRecipient("");
              }}
              searchPlaceholder="Search clients"
              options={accessible.map((c) => ({
                id: c.company_id,
                name: getFirmClientName(c),
                label: getFirmClientName(c),
              }))}
            />
          </div>
          {canManage ? (
            <div className="space-y-3 rounded-lg border bg-card p-4">
              <h3 className="font-semibold">New information request</h3>
              {recipientsQ.isPending ? (
                <LoadingState rows={1} />
              ) : recipientsQ.isError ? (
                <QueryErrorState queries={[recipientsQ]} title="Could not load authorised recipients" />
              ) : !recipientsQ.isSuccess ? (
                <LoadingState />
              ) : recipients.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No other eligible active company staff. Invite an authorised company user through
                  Users &amp; Access first.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Requested from</Label>
                    <RecordLookupSelect required value={requestedFrom} onValueChange={setRecipient}>
                      <SelectTrigger aria-label="Requested recipient">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {recipients.map((p) => (
                          <SelectItem key={p.user_id} value={p.user_id}>
                            {p.full_name || p.email || "Company colleague"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </RecordLookupSelect>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="firm-request-due">Due date</Label>
                    <Input
                      id="firm-request-due"
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor="firm-request-subject">Document needed</Label>
                    <Input
                      id="firm-request-subject"
                      value={subject}
                      maxLength={160}
                      placeholder="October bank statements"
                      onChange={(e) => setSubject(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor="firm-request-details">Instructions</Label>
                    <textarea
                      id="firm-request-details"
                      className="min-h-20 w-full rounded-md border bg-background p-3 text-sm"
                      maxLength={2000}
                      value={instructions}
                      onChange={(e) => setInstructions(e.target.value)}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Button
                      disabled={
                        createM.isPending || subject.trim().length < 3 || !requestedFrom || !dueDate
                      }
                      onClick={() => createM.mutate()}
                    >
                      {createM.isPending ? "Creating…" : "Request document"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : null}
          {requestsQ.isPending ? (
            <LoadingState />
          ) : requestsQ.isError ? (
            <QueryErrorState queries={[requestsQ]} title="Could not load document requests" />
          ) : !requestsQ.isSuccess ? (
            <LoadingState />
          ) : (requestsQ.data ?? []).length === 0 ? (
            <EmptyState
              title="No tracked requests"
              description="Requests you create or receive will appear here."
            />
          ) : (
            (requestsQ.data ?? []).map((request) => {
              const d = request.action_document_requests;
              if (!d) return null;
              const pending = !d.cancelled_at && !d.completed_at;
              return (
                <div key={request.request_id} className="space-y-2 rounded-lg border bg-card p-4">
                  <div className="flex flex-wrap justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">{d.subject}</h3>
                      <p className="text-xs text-muted-foreground">
                        Due {request.due_date} · Created{" "}
                        {new Date(d.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <RequestStatus request={request} />
                  </div>
                  {d.instructions ? (
                    <p className="whitespace-pre-wrap text-sm">{d.instructions}</p>
                  ) : null}
                  {pending && request.viewer_can_cancel && canManage ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={cancelM.isPending}
                      onClick={() => {
                        if (window.confirm("Cancel this document request?"))
                          cancelM.mutate(request.request_id);
                      }}
                    >
                      Cancel request
                    </Button>
                  ) : null}
                  {pending && request.viewer_can_complete ? (
                    <RequestCompletion
                      firmId={firmId}
                      companyId={companyId}
                      request={request}
                      onUpdated={refresh}
                    />
                  ) : null}
                  {d.attachment_id ? (
                    <p className="text-xs text-muted-foreground">
                      Received document is stored with the client's existing company attachments.
                    </p>
                  ) : null}
                </div>
              );
            })
          )}
        </>
      )}
    </section>
  );
}
