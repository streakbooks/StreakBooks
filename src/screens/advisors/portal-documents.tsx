import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdvisorsPortalSubnav } from "@/components/advisors/AdvisorsPortalSubnav";
import { EmptyState, LoadingState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  listAdvisorsPortalDocuments,
  markAdvisorsPortalDocumentReceived,
} from "@/lib/advisors/portal.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";

export function AdvisorsPortalDocumentsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listAdvisorsPortalDocuments);
  const mark = useServerFn(markAdvisorsPortalDocumentReceived);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const query = useQuery({
    queryKey: ["advisors-portal-documents"],
    queryFn: () => list(),
    retry: false,
  });

  const markM = useMutation({
    mutationFn: ({ requestId, note }: { requestId: string; note?: string }) =>
      mark({ data: { requestId, note } }),
    onSuccess: async (_result, variables) => {
      toast.success("Your advisor was notified that you shared this file");
      setNotes((current) => ({ ...current, [variables.requestId]: "" }));
      await qc.invalidateQueries({ queryKey: ["advisors-portal-documents"] });
      await qc.invalidateQueries({ queryKey: ["advisors-portal-home"] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (query.isPending)
    return (
      <main className="mx-auto max-w-5xl space-y-6 p-6">
        <ListWorkspace
          title="Files to send"
          description="Review information requested by your advisor."
        >
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
        <ListWorkspace
          title="Files to send"
          description="Review information requested by your advisor."
        >
          <AdvisorsPortalSubnav />
          <div role="alert">
            <QueryErrorState queries={[query]} title="Documents unavailable" />
          </div>
        </ListWorkspace>
      </main>
    );
  }
  if (!query.isSuccess || !query.data) return null;

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <ListWorkspace
        title="Files to send"
        description="See what your advisor needs, upload it securely, then confirm that you have shared it."
      >
        <AdvisorsPortalSubnav />
        <div className="max-w-md space-y-2">
          <p className="text-xs text-muted-foreground">
            This portal records your confirmation; it does not upload or store the file itself.
          </p>
        </div>
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          {query.data.length} document {query.data.length === 1 ? "request" : "requests"} found
        </p>
        {query.data.length === 0 ? (
          <EmptyState
            title="No document requests"
            description="Your advisor will request files here when needed."
            action={
              <Button asChild size="sm" variant="outline">
                <Link to="/advisors-portal/messages">Message your advisor</Link>
              </Button>
            }
          />
        ) : (
          <ul className="space-y-3">
            {query.data.map((item) => (
              <li key={item.id} className="space-y-2 rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{item.title}</p>
                    <p className="text-sm text-muted-foreground">{item.workspaceTitle}</p>
                  </div>
                  <Badge variant="secondary">{item.status}</Badge>
                </div>
                {item.instructions ? (
                  <p className="text-sm text-muted-foreground">{item.instructions}</p>
                ) : null}
                {item.companyId ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link to="/files">Open secure Files</Link>
                    </Button>
                    {item.status === "requested" ? (
                      <div className="flex w-full flex-col items-start gap-2 sm:flex-row sm:items-end">
                        <div className="w-full max-w-md space-y-1">
                          <label className="text-xs font-medium" htmlFor={`doc-note-${item.id}`}>
                            Note for your advisor (optional)
                          </label>
                          <Input
                            id={`doc-note-${item.id}`}
                            value={notes[item.id] ?? ""}
                            onChange={(event) =>
                              setNotes((current) => ({
                                ...current,
                                [item.id]: event.target.value,
                              }))
                            }
                            placeholder="Add a short note about this file"
                            maxLength={500}
                          />
                        </div>
                        <Button
                          size="sm"
                          disabled={markM.isPending}
                          onClick={() => {
                            const note = notes[item.id]?.trim();
                            markM.mutate({ requestId: item.id, ...(note ? { note } : {}) });
                          }}
                        >
                          I’ve shared this file
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {!item.companyId && item.status === "requested" ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Secure Files are not linked to this client account yet. Message your advisor
                      to arrange a secure way to share it.
                    </p>
                    <Button asChild size="sm" variant="outline">
                      <Link to="/advisors-portal/messages">Message your advisor</Link>
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </ListWorkspace>
    </main>
  );
}
