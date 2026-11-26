import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  listFirmClientPermissionRequests,
  reviewFirmClientPermissionRequest,
} from "@/lib/firm/firm.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, LoadingState } from "@/components/common/states";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { useCanDo } from "@/hooks/use-can";

export function FirmPermissionApprovals({ companyId }: { companyId: string }) {
  const canReview = useCanDo("members.manage");
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const load = useServerFn(listFirmClientPermissionRequests);
  const review = useServerFn(reviewFirmClientPermissionRequest);
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["firm-client-permission-requests", companyId],
    queryFn: () => load({ data: { companyId } }),
  });
  const mutation = useMutation({
    mutationFn: ({
      requestId,
      decision,
    }: {
      requestId: string;
      decision: "approved" | "rejected";
    }) =>
      review({
        data: {
          requestId,
          companyId,
          decision,
          reviewReason:
            reasons[requestId]?.trim() ||
            (decision === "approved"
              ? "Approved by company administrator"
              : "Declined by company administrator"),
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["firm-client-permission-requests", companyId] });
      toast.success("Firm permission request reviewed");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (!canReview) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Firm permission approvals</CardTitle>
        <CardDescription>
          Review firm requests for posting, bank feeds, billing, settings, tax, or member
          administration. Approval applies only to the named staff member and permission.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {query.isPending ? <LoadingState /> : null}
        {query.isError ? (
          <QueryErrorState queries={[query]} title="Could not load firm access requests" />
        ) : null}
        {query.isSuccess && query.data.length === 0 ? (
          <EmptyState
            title="No pending requests"
            description="Firm requests needing your review will appear here."
          />
        ) : null}
        {(query.data ?? []).map((request) => (
          <article key={request.id} className="space-y-3 rounded-lg border p-4">
            <div>
              <p className="font-medium">
                {request.firm_name} · {request.staff_name}
              </p>
              <p className="text-sm text-muted-foreground">
                Requested: {request.permission_keys.join(", ")}
              </p>
              <p className="mt-1 text-sm">{request.request_reason}</p>
              <time className="text-xs text-muted-foreground" dateTime={request.requested_at}>
                {new Intl.DateTimeFormat(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(request.requested_at))}
              </time>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`firm-review-${request.id}`}>Decision note (optional)</Label>
              <Input
                id={`firm-review-${request.id}`}
                value={reasons[request.id] ?? ""}
                maxLength={1000}
                onChange={(event) =>
                  setReasons((current) => ({ ...current, [request.id]: event.target.value }))
                }
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={mutation.isPending}
                onClick={() => mutation.mutate({ requestId: request.id, decision: "approved" })}
              >
                Approve requested permissions
              </Button>
              <Button
                variant="outline"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate({ requestId: request.id, decision: "rejected" })}
              >
                Reject
              </Button>
            </div>
          </article>
        ))}
      </CardContent>
    </Card>
  );
}
