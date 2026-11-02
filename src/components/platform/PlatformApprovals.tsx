import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  decidePlatformApproval,
  listPlatformApprovals,
  setPlatformEntitlement,
} from "@/lib/platform/platform.functions";
import { FEATURE_REGISTRY } from "@/lib/platform/feature-registry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { platformDate } from "@/lib/platform/support";
import type { Row } from "@/lib/platform/catalog";

type GrantDraft = {
  feature: string;
  scope: "business" | "firm" | "user" | "global";
  scopeId: string;
  source: "grant" | "revoke" | "addon" | "trial" | "kill_switch";
  effect: "allow" | "deny";
  reason: string;
};

const emptyGrant: GrantDraft = {
  feature: "ai_queries",
  scope: "business",
  scopeId: "",
  source: "grant",
  effect: "allow",
  reason: "",
};

export function PlatformApprovals({
  canManage,
  userId,
  canGrant,
}: {
  canManage: boolean;
  userId: string;
  canGrant: boolean;
}) {
  const list = useServerFn(listPlatformApprovals);
  const decide = useServerFn(decidePlatformApproval);
  const change = useServerFn(setPlatformEntitlement);
  const cache = useQueryClient();
  const [grant, setGrant] = useState(emptyGrant);
  const [decisionReason, setDecisionReason] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["platform", "approvals"],
    queryFn: () => list(),
    retry: false,
  });
  const refresh = async () => {
    await cache.invalidateQueries({ queryKey: ["platform", "approvals"] });
  };
  const submitGrant = useMutation({
    mutationFn: () =>
      change({
        data: {
          feature: grant.feature,
          scope: grant.scope,
          scopeId: grant.scope === "global" ? null : grant.scopeId,
          planCode: null,
          source: grant.source,
          effect: grant.effect,
          startsAt: null,
          expiresAt: null,
          reason: grant.reason,
          notes: "",
        },
      }),
    onSuccess: async (result) => {
      setNotice(
        result.pending
          ? "Submitted for a second approver. It is not active yet."
          : "Entitlement saved. Existing accounting records were not deleted.",
      );
      setGrant(emptyGrant);
      await refresh();
    },
  });
  const submitDecision = useMutation({
    mutationFn: (input: { id: string; decision: "approved" | "rejected" }) =>
      decide({ data: { ...input, reason: decisionReason } }),
    onSuccess: async () => {
      setNotice("Decision recorded.");
      setDecisionReason("");
      await refresh();
    },
  });
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        A person cannot approve their own request. Kill switches and global changes wait here until
        someone else confirms them. Removing a feature hides or freezes it; it does not delete
        ledger history.
      </p>
      {notice ? <p role="status">{notice}</p> : null}
      {canGrant ? (
        <section className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold">Grant or revoke one feature</h2>
          <form
            className="mt-4 grid gap-3 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              submitGrant.mutate();
            }}
          >
            <label className="text-sm">
              Feature
              <RecordLookupSelect
                className="mt-1 w-full rounded-md border bg-background px-3 py-2"
                aria-label="Feature"
                value={grant.feature}
                onValueChange={(feature) => setGrant({ ...grant, feature })}
              >
                {FEATURE_REGISTRY.map((feature) => (
                  <option key={feature.key} value={feature.key}>
                    {feature.key} — {feature.name}
                  </option>
                ))}
              </RecordLookupSelect>
            </label>
            <label className="text-sm">
              Scope
              <select
                className="mt-1 w-full rounded-md border bg-background px-3 py-2"
                aria-label="Scope"
                value={grant.scope}
                onChange={(event) =>
                  setGrant({ ...grant, scope: event.target.value as typeof grant.scope })
                }
              >
                <option value="business">Business</option>
                <option value="firm">Accounting firm</option>
                <option value="user">User</option>
                <option value="global">Global</option>
              </select>
            </label>
            {grant.scope !== "global" ? (
              <label className="text-sm">
                Scope id
                <Input
                  aria-label="Scope id"
                  value={grant.scopeId}
                  onChange={(event) => setGrant({ ...grant, scopeId: event.target.value })}
                  placeholder="Business, firm or user id"
                />
              </label>
            ) : null}
            <label className="text-sm">
              Change
              <select
                className="mt-1 w-full rounded-md border bg-background px-3 py-2"
                aria-label="Change"
                value={`${grant.source}:${grant.effect}`}
                onChange={(event) => {
                  const [source, effect] = event.target.value.split(":") as [
                    typeof grant.source,
                    typeof grant.effect,
                  ];
                  setGrant({ ...grant, source, effect });
                }}
              >
                <option value="grant:allow">Grant</option>
                <option value="revoke:deny">Revoke</option>
                <option value="addon:allow">Billable add-on</option>
                <option value="trial:allow">Trial</option>
                <option value="kill_switch:deny">Kill switch</option>
              </select>
            </label>
            <label className="text-sm md:col-span-2">
              Reason
              <Input
                aria-label="Entitlement reason"
                value={grant.reason}
                onChange={(event) => setGrant({ ...grant, reason: event.target.value })}
                required
                minLength={3}
              />
            </label>
            <div>
              <Button
                type="submit"
                disabled={submitGrant.isPending || grant.reason.trim().length < 3}
              >
                {submitGrant.isPending ? "Saving…" : "Save entitlement"}
              </Button>
            </div>
          </form>
          {submitGrant.isError ? (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {submitGrant.error.message}
            </p>
          ) : null}
        </section>
      ) : null}
      <section className="rounded-xl border bg-card p-5">
        <h2 className="font-semibold">Pending approvals</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Latest 100 unexpired pending requests. Times use your device time zone.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Review the scope and expiry before deciding. Unsupported request types can be rejected;
          approval stays unavailable until an executable handler exists.
        </p>
        {query.isPending ? <p role="status">Loading approvals…</p> : null}
        {query.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {query.error.message}
          </p>
        ) : null}
        {query.data && query.data.rows.length === 0 ? (
          <p className="mt-3 text-sm">No pending approvals.</p>
        ) : null}
        <ul className="mt-4 space-y-3">
          {(query.data?.rows ?? []).map((row) => (
            <li key={String(row["id"])} className="rounded-lg border p-4 text-sm">
              <p>
                <strong>{String(row["kind"])}</strong> · {String(row["status"])}
              </p>
              <p className="text-muted-foreground">{String(row["reason"])}</p>
              <p className="mt-1 text-muted-foreground">
                Requested by {String(row["requester_id"])} · Expires{" "}
                {platformDate(row["expires_at"])}
              </p>
              {row["impact"] && typeof row["impact"] === "object" ? (
                <dl className="mt-2 grid gap-1">
                  {Object.entries(row["impact"] as Row).map(([key, value]) => (
                    <div key={key}>
                      <dt className="inline font-medium">{key}: </dt>
                      <dd className="inline">{String(value)}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {row["requester_id"] === userId && row["status"] === "pending" ? (
                <p className="mt-2 text-muted-foreground">Waiting for a different approver.</p>
              ) : null}
              {canManage && row["requester_id"] !== userId && row["status"] === "pending" ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() =>
                      submitDecision.mutate({ id: String(row["id"]), decision: "approved" })
                    }
                    disabled={
                      decisionReason.trim().length < 3 ||
                      submitDecision.isPending ||
                      !["entitlement", "break_glass"].includes(String(row["kind"])) ||
                      new Date(String(row["expires_at"])).getTime() <= Date.now()
                    }
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      submitDecision.mutate({ id: String(row["id"]), decision: "rejected" })
                    }
                    disabled={decisionReason.trim().length < 3 || submitDecision.isPending}
                  >
                    Reject
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        {query.data && query.data.rows.some((row: Row) => row["status"] === "pending") ? (
          <label className="mt-4 block text-sm">
            Decision reason
            <Input
              aria-label="Decision reason"
              value={decisionReason}
              onChange={(event) => setDecisionReason(event.target.value)}
            />
          </label>
        ) : null}
        {submitDecision.isError ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {submitDecision.error.message}
          </p>
        ) : null}
      </section>
    </div>
  );
}
