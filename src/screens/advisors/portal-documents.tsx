import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdvisorsPortalSubnav } from "@/components/advisors/AdvisorsPortalSubnav";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
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
  const [note, setNote] = useState("");

  const query = useQuery({
    queryKey: ["advisors-portal-documents"],
    queryFn: () => list(),
    retry: false,
  });

  const markM = useMutation({
    mutationFn: (requestId: string) => mark({ data: { requestId, note: note || undefined } }),
    onSuccess: async () => {
      toast.success("Marked as uploaded");
      setNote("");
      await qc.invalidateQueries({ queryKey: ["advisors-portal-documents"] });
      await qc.invalidateQueries({ queryKey: ["advisors-portal-home"] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (query.isPending)
    return (
      <main className="mx-auto max-w-5xl space-y-6 p-6">
        <ListWorkspace title="Documents" description="Requested files for your delivery periods.">
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
        <ListWorkspace title="Documents" description="Requested files for your delivery periods.">
          <AdvisorsPortalSubnav />
          <div role="alert">
            <ErrorState
              title="Documents unavailable"
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
      <ListWorkspace
        title="Documents"
        description="Mark requested items as uploaded. Binary file storage reuses your linked company Files area when available."
      >
        <AdvisorsPortalSubnav />
        <div className="max-w-md space-y-2">
          <label className="text-sm font-medium" htmlFor="doc-note">
            Upload note (optional)
          </label>
          <Input
            id="doc-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Where the file was uploaded / reference"
            maxLength={500}
          />
        </div>
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          {query.data.length} document {query.data.length === 1 ? "request" : "requests"} found
        </p>
        {query.data.length === 0 ? (
          <EmptyState
            title="No document requests"
            description="Your advisor will request files here when needed."
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
                {item.status === "requested" ? (
                  <Button
                    size="sm"
                    disabled={markM.isPending}
                    onClick={() => markM.mutate(item.id)}
                  >
                    Mark uploaded
                  </Button>
                ) : null}
                {item.companyId ? (
                  <p className="text-xs text-muted-foreground">
                    Company files linked — use Files for binary uploads when your advisor asks.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </ListWorkspace>
    </main>
  );
}
