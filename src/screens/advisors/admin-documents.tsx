import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { Link } from "@tanstack/react-router";
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
import {
  listAdvisorsDocumentRequests,
  upsertAdvisorsDocumentRequest,
} from "@/lib/advisors/workspaces.functions";
import type { AdvisorsDocumentRequestStatus } from "@/lib/advisors/workspaces";
import { friendlyAuthError } from "@/lib/auth-helpers";

const STATUSES: Array<AdvisorsDocumentRequestStatus | "all"> = [
  "all",
  "requested",
  "received",
  "reviewed",
  "cancelled",
];

export function AdvisorsAdminDocumentsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listAdvisorsDocumentRequests);
  const upsert = useServerFn(upsertAdvisorsDocumentRequest);
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("requested");
  const [reason, setReason] = useState("");

  const query = useQuery({
    queryKey: ["advisors-documents", status],
    queryFn: () =>
      list({
        data: {
          status: status === "all" ? undefined : status,
        },
      }),
    retry: false,
  });

  const updateM = useMutation({
    mutationFn: (input: { id: string; status: AdvisorsDocumentRequestStatus }) =>
      upsert({
        data: {
          id: input.id,
          status: input.status,
          reason: reason || `Updated Advisors document request to ${input.status}`,
        },
      }),
    onSuccess: async () => {
      toast.success("Document request updated");
      setReason("");
      await qc.invalidateQueries({ queryKey: ["advisors-documents"] });
      await qc.invalidateQueries({ queryKey: ["advisors-overview"] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (query.isPending) return <LoadingState />;
  if (query.isError) {
    return (
      <main className="mx-auto max-w-6xl space-y-6 p-6">
        <ListWorkspace title="Documents" description="Advisors delivery document requests.">
          <ErrorState
            title="Document requests unavailable"
            description={friendlyAuthError(query.error)}
            onRetry={() => void query.refetch()}
          />
        </ListWorkspace>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <ListWorkspace
        title="Documents"
        description="Track Advisors document requests for delivery periods. Binary uploads reuse company documents when a billing company is linked (AD-07/AD-09)."
        subnav={<AdvisorsSubnav />}
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="doc-status">Status</Label>
            <RecordLookupSelect
              id="doc-status"
              className="flex h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={status}
              onValueChange={(event) => setStatus(event as (typeof STATUSES)[number])}
            >
              {STATUSES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </RecordLookupSelect>
          </div>
          <div className="min-w-[16rem] flex-1 space-y-1">
            <Label htmlFor="doc-reason">Change reason</Label>
            <Input
              id="doc-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Why are you updating this request?"
            />
          </div>
        </div>

        <section className="space-y-2">
          {query.data.length === 0 ? (
            <EmptyState
              title="No document requests"
              description="Opening a work period seeds document requests for bookkeeping and coaching prep."
              action={
                <Button asChild size="sm">
                  <Link to="/advisors-admin/workspaces">Open workspaces</Link>
                </Button>
              }
            />
          ) : (
            query.data.map((request) => (
              <article
                key={request.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border/70 p-4"
              >
                <div>
                  <p className="font-medium">{request.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {request.workspaceTitle} · {request.clientName || request.clientEmail}
                  </p>
                  {request.instructions ? (
                    <p className="mt-2 text-sm whitespace-pre-wrap">{request.instructions}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{request.status}</Badge>
                  {request.status === "requested" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={updateM.isPending}
                      onClick={() => updateM.mutate({ id: request.id, status: "received" })}
                    >
                      Received
                    </Button>
                  ) : null}
                  {request.status === "received" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={updateM.isPending}
                      onClick={() => updateM.mutate({ id: request.id, status: "reviewed" })}
                    >
                      Reviewed
                    </Button>
                  ) : null}
                  {request.status !== "cancelled" && request.status !== "reviewed" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={updateM.isPending}
                      onClick={() => updateM.mutate({ id: request.id, status: "cancelled" })}
                    >
                      Cancel
                    </Button>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </section>
      </ListWorkspace>
    </main>
  );
}
