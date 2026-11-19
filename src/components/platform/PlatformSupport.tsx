import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getSupervisedSupport,
  requestSupervisedSupport,
  revokeSupervisedSupport,
} from "@/lib/platform/platform.functions";
import { platformDate } from "@/lib/platform/support";
import type { PlatformContext } from "@/lib/platform/catalog";

export function SupportRequestForm({
  companyId,
  business,
}: {
  companyId: string;
  business: string;
}) {
  const request = useServerFn(requestSupervisedSupport);
  const cache = useQueryClient();
  const [reason, setReason] = useState("");
  const [minutes, setMinutes] = useState(60);
  const mutation = useMutation({
    mutationFn: () =>
      request({ data: { companyId, reason, minutes, requestId: crypto.randomUUID() } }),
    onSuccess: async () => {
      setReason("");
      await cache.invalidateQueries({ queryKey: ["platform", "supervised-support"] });
      await cache.invalidateQueries({ queryKey: ["platform", "approvals"] });
    },
  });
  return (
    <form
      className="space-y-3 rounded-lg border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <h3 className="font-semibold">Request temporary support access</h3>
      <p className="text-sm text-muted-foreground">
        {business}: read up to 25 journal diagnostic headers after a second person approves. The
        request gives you no access until then.
      </p>
      <label className="block text-sm">
        Duration
        <select
          className="mt-1 block rounded-md border bg-background p-2"
          aria-label="Support duration"
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value))}
        >
          <option value={15}>15 minutes</option>
          <option value={30}>30 minutes</option>
          <option value={60}>1 hour</option>
          <option value={120}>2 hours</option>
          <option value={240}>4 hours</option>
        </select>
      </label>
      <label className="block text-sm">
        Investigation reason
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          minLength={3}
          maxLength={1000}
        />
      </label>
      <Button disabled={mutation.isPending || reason.trim().length < 3}>
        {mutation.isPending ? "Submitting…" : "Request second-person approval"}
      </Button>
      {mutation.isSuccess ? (
        <p role="status">Submitted for approval. Access is not active yet.</p>
      ) : null}
      {mutation.isError ? (
        <p role="alert" className="text-destructive">
          {mutation.error.message}
        </p>
      ) : null}
    </form>
  );
}
export function PlatformSupport({
  context,
  onRead,
  reading = false,
}: {
  context: PlatformContext;
  onRead?: (companyId: string) => void;
  reading?: boolean;
}) {
  const load = useServerFn(getSupervisedSupport);
  const revoke = useServerFn(revokeSupervisedSupport);
  const cache = useQueryClient();
  const [reason, setReason] = useState("");
  const query = useQuery({
    queryKey: ["platform", "supervised-support"],
    queryFn: () => load(),
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: (id: string) => revoke({ data: { id, reason } }),
    onSuccess: async () => {
      setReason("");
      await cache.invalidateQueries({ queryKey: ["platform", "supervised-support"] });
      await cache.invalidateQueries({ queryKey: ["platform", "approvals"] });
      await cache.invalidateQueries({ queryKey: ["platform", "grants"] });
    },
  });
  return (
    <section
      className="space-y-3 rounded-xl border bg-card p-5"
      aria-label="Temporary support access"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Temporary support access</h2>
        <Button variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}>
          Refresh access requests
        </Button>
      </div>
      {query.isPending ? <p role="status">Loading support requests…</p> : null}
      {query.isError ? (
        <QueryErrorState queries={[query]} title="Could not load support access requests" />
      ) : null}
      {query.data?.ready === false ? (
        <p role="status">
          Supervised support is unavailable until its reviewed database migration is applied.
        </p>
      ) : null}
      {query.data?.ready ? (
        <>
          <p className="text-sm text-muted-foreground">
            Open a business in Businesses to request access. A different person with approval
            permission must decide it in Approvals. Latest 100 requests; times use your device time
            zone.
          </p>
          {query.data.rows.length === 0 ? <p>No support access requests recorded.</p> : null}
          <ul className="space-y-3">
            {query.data.rows.map((row) => {
              const canRevoke =
                context.permissions.includes("support.manage") &&
                (context.role === "platform_owner" ||
                  row.requester_id === context.userId ||
                  row.approver_id === context.userId);
              return (
                <li key={row.id} className="rounded-lg border p-4 text-sm">
                  <p className="font-medium">
                    {row.business} · {row.status}
                  </p>
                  <p>{row.reason}</p>
                  <p className="text-muted-foreground">
                    Requested by {row.requester || row.requester_id} · Expires{" "}
                    {platformDate(row.expires_at)}
                  </p>
                  {onRead && row.status === "active" && row.requester_id === context.userId ? (
                    <Button
                      className="mr-2 mt-2"
                      variant="outline"
                      disabled={reading}
                      onClick={() => onRead(row.company_id)}
                    >
                      Read diagnostics for {row.business}
                    </Button>
                  ) : null}
                  {canRevoke && (row.status === "active" || row.status === "pending") ? (
                    <Button
                      className="mt-2"
                      variant="outline"
                      disabled={mutation.isPending || reason.trim().length < 3}
                      onClick={() => mutation.mutate(row.id)}
                    >
                      Revoke access to {row.business}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {context.permissions.includes("support.manage") ? (
            <label className="block text-sm">
              Revocation reason
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                minLength={3}
                maxLength={1000}
              />
            </label>
          ) : null}
        </>
      ) : null}
      {mutation.isError ? (
        <p role="alert" className="text-destructive">
          {mutation.error.message}
        </p>
      ) : null}
      {mutation.isSuccess ? <p role="status">Access revoked.</p> : null}
    </section>
  );
}
