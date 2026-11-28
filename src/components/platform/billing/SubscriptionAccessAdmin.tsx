import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  endPlatformCompanyTrial,
  extendPlatformCompanyTrial,
  getPlatformSubscriptionAdminDetail,
  grantPlatformSubscriptionAccess,
  revokePlatformSubscriptionAccess,
  setPlatformEntitlementLimit,
} from "@/lib/billing/subscription-admin.functions";
import { setPlatformEntitlement } from "@/lib/platform/platform.functions";

type Props = { canEdit: boolean };

const PLAN_OPTIONS = ["standard", "pro", "business", "practice"] as const;

export function SubscriptionAccessAdmin({ canEdit }: Props) {
  const [companyId, setCompanyId] = useState("");
  const detailFn = useServerFn(getPlatformSubscriptionAdminDetail);
  const grantFn = useServerFn(grantPlatformSubscriptionAccess);
  const revokeFn = useServerFn(revokePlatformSubscriptionAccess);
  const extendFn = useServerFn(extendPlatformCompanyTrial);
  const endTrialFn = useServerFn(endPlatformCompanyTrial);
  const entitlementFn = useServerFn(setPlatformEntitlement);
  const queryClient = useQueryClient();

  const detail = useQuery({
    queryKey: ["platform-subscription-admin", companyId],
    queryFn: () => detailFn({ data: { companyId } }),
    enabled: /^[0-9a-f-]{36}$/i.test(companyId),
    retry: false,
  });

  const [planCode, setPlanCode] = useState<string>("pro");
  const [endsAt, setEndsAt] = useState("");
  const [lifetime, setLifetime] = useState(false);
  const [acknowledgePaid, setAcknowledgePaid] = useState(false);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [extraDays, setExtraDays] = useState("14");
  const [featureKey, setFeatureKey] = useState("");
  const [featureEffect, setFeatureEffect] = useState<"allow" | "deny">("allow");
  const [featureExpires, setFeatureExpires] = useState("");
  const [limitFeature, setLimitFeature] = useState("seats");
  const [limitValue, setLimitValue] = useState("10");
  const limitFn = useServerFn(setPlatformEntitlementLimit);

  const sub = detail.data?.subscription ?? null;
  const company = detail.data?.company ?? null;
  const grant = detail.data?.activeGrant ?? null;
  const overrides = detail.data?.entitlementOverrides ?? [];
  const audit = detail.data?.audit ?? [];

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["platform-subscription-admin", companyId] });
  }

  return (
    <section className="space-y-4 rounded-xl border bg-card p-5">
      <div>
        <h2 className="text-lg font-semibold">Customer subscription administration</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Grant complimentary access, extend no-card trials, and set per-company feature overrides.
          Paid Stripe/Razorpay mandates are not cancelled by complimentary grants. Plan catalogue,
          coupons, and feature rollouts stay in their existing panels.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="space-y-1">
          <Label htmlFor="sub-admin-company">Company ID</Label>
          <Input
            id="sub-admin-company"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value.trim())}
            placeholder="uuid"
            autoComplete="off"
          />
        </div>
        <div className="flex items-end">
          <Button type="button" variant="secondary" onClick={() => refresh()} disabled={!companyId}>
            Load
          </Button>
        </div>
      </div>

      {detail.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {(detail.error as Error).message}
        </p>
      ) : null}

      {detail.isSuccess && company ? (
        <div className="space-y-4 border-t pt-4">
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <p>
              <span className="text-muted-foreground">Company</span>
              <br />
              <strong>{company.name}</strong>
            </p>
            <p>
              <span className="text-muted-foreground">Plan / status / provider</span>
              <br />
              <strong>
                {sub?.planCode ?? "—"} · {sub?.status ?? "—"} · {sub?.provider ?? "—"}
              </strong>
            </p>
            <p>
              <span className="text-muted-foreground">Trial ends</span>
              <br />
              {sub?.trialEndsAt ? new Date(sub.trialEndsAt).toLocaleString() : "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Renewal / period end</span>
              <br />
              {sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleString() : "—"}
            </p>
            <p className="sm:col-span-2">
              <span className="text-muted-foreground">Provider subscription</span>
              <br />
              <code className="text-xs">{sub?.providerSubscriptionId ?? "none"}</code>
            </p>
          </div>

          {grant ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/30">
              Active complimentary grant: <strong>{grant.planCode}</strong>
              {grant.lifetime
                ? " (lifetime)"
                : grant.endsAt
                  ? ` until ${new Date(grant.endsAt).toLocaleString()}`
                  : ""}
              <div className="mt-1 text-muted-foreground">{grant.reason}</div>
            </div>
          ) : null}

          {canEdit ? (
            <div className="grid gap-6 lg:grid-cols-2">
              <form
                className="space-y-3 rounded-lg border p-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (
                    !window.confirm(
                      lifetime
                        ? "Grant lifetime complimentary access? This does not create a payment."
                        : "Grant complimentary access until the end date? This does not create a payment.",
                    )
                  ) {
                    return;
                  }
                  grantFn({
                    data: {
                      companyId,
                      planCode,
                      endsAt: lifetime ? null : new Date(endsAt).toISOString(),
                      lifetime,
                      reason,
                      notes,
                      acknowledgePaidOverlap: acknowledgePaid,
                    },
                  })
                    .then(() => {
                      toast.success("Complimentary access granted");
                      refresh();
                    })
                    .catch((error: unknown) =>
                      toast.error(error instanceof Error ? error.message : "Grant failed"),
                    );
                }}
              >
                <h3 className="font-medium">Grant complimentary access</h3>
                <div className="space-y-1">
                  <Label htmlFor="grant-plan">Plan</Label>
                  <select
                    id="grant-plan"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={planCode}
                    onChange={(e) => setPlanCode(e.target.value)}
                  >
                    {PLAN_OPTIONS.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="grant-lifetime"
                    type="checkbox"
                    checked={lifetime}
                    onChange={(e) => setLifetime(e.target.checked)}
                  />
                  <Label htmlFor="grant-lifetime">Lifetime (explicit)</Label>
                </div>
                {!lifetime ? (
                  <div className="space-y-1">
                    <Label htmlFor="grant-ends">Ends at</Label>
                    <Input
                      id="grant-ends"
                      type="datetime-local"
                      value={endsAt}
                      onChange={(e) => setEndsAt(e.target.value)}
                      required
                    />
                  </div>
                ) : null}
                <div className="flex items-center gap-2">
                  <input
                    id="grant-ack"
                    type="checkbox"
                    checked={acknowledgePaid}
                    onChange={(e) => setAcknowledgePaid(e.target.checked)}
                  />
                  <Label htmlFor="grant-ack">
                    Acknowledge paid provider overlap (does not cancel Stripe/Razorpay)
                  </Label>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="grant-reason">Reason</Label>
                  <Input
                    id="grant-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    required
                    minLength={3}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="grant-notes">Internal note</Label>
                  <Textarea
                    id="grant-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit">Grant access</Button>
                  {grant ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const why = window.prompt("Reason to revoke complimentary access");
                        if (!why || why.trim().length < 3) return;
                        revokeFn({ data: { companyId, reason: why.trim() } })
                          .then(() => {
                            toast.success("Complimentary access revoked");
                            refresh();
                          })
                          .catch((error: unknown) =>
                            toast.error(error instanceof Error ? error.message : "Revoke failed"),
                          );
                      }}
                    >
                      Revoke grant
                    </Button>
                  ) : null}
                </div>
              </form>

              <div className="space-y-4">
                <form
                  className="space-y-3 rounded-lg border p-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    extendFn({
                      data: {
                        companyId,
                        extraDays: Number(extraDays),
                        reason: reason || "Trial extension",
                      },
                    })
                      .then((result) => {
                        toast.success(`Trial extended to ${result.trialEndsAt}`);
                        refresh();
                      })
                      .catch((error: unknown) =>
                        toast.error(error instanceof Error ? error.message : "Extend failed"),
                      );
                  }}
                >
                  <h3 className="font-medium">No-card trial</h3>
                  <p className="text-xs text-muted-foreground">
                    Extends local `provider=none` trials only. Does not change Stripe or Razorpay
                    trial_end.
                  </p>
                  <div className="space-y-1">
                    <Label htmlFor="extra-days">Extra days</Label>
                    <Input
                      id="extra-days"
                      type="number"
                      min={1}
                      max={366}
                      value={extraDays}
                      onChange={(e) => setExtraDays(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" variant="secondary">
                      Extend trial
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const why = window.prompt("Reason to end trial");
                        if (!why || why.trim().length < 3) return;
                        endTrialFn({ data: { companyId, reason: why.trim() } })
                          .then(() => {
                            toast.success("Trial ended");
                            refresh();
                          })
                          .catch((error: unknown) =>
                            toast.error(error instanceof Error ? error.message : "End failed"),
                          );
                      }}
                    >
                      End trial
                    </Button>
                  </div>
                </form>

                <form
                  className="space-y-3 rounded-lg border p-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    entitlementFn({
                      data: {
                        feature: featureKey,
                        scope: "business",
                        scopeId: companyId,
                        planCode: null,
                        source: featureEffect === "allow" ? "grant" : "revoke",
                        effect: featureEffect,
                        startsAt: null,
                        expiresAt: featureExpires ? new Date(featureExpires).toISOString() : null,
                        reason: reason || "Subscription feature override",
                        notes,
                      },
                    })
                      .then((result) => {
                        toast.success(
                          result.pending
                            ? "Override submitted for approval"
                            : "Feature override saved",
                        );
                        refresh();
                      })
                      .catch((error: unknown) =>
                        toast.error(error instanceof Error ? error.message : "Override failed"),
                      );
                  }}
                >
                  <h3 className="font-medium">Feature override</h3>
                  <p className="text-xs text-muted-foreground">
                    Precedence: suspension → deny → grant → plan → default (server-enforced via
                    winning_entitlements).
                  </p>
                  <div className="space-y-1">
                    <Label htmlFor="feature-key">Feature key</Label>
                    <Input
                      id="feature-key"
                      value={featureKey}
                      onChange={(e) => setFeatureKey(e.target.value)}
                      placeholder="e.g. api_access"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="feature-effect">Effect</Label>
                    <select
                      id="feature-effect"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={featureEffect}
                      onChange={(e) => setFeatureEffect(e.target.value as "allow" | "deny")}
                    >
                      <option value="allow">Allow (grant)</option>
                      <option value="deny">Deny (revoke)</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="feature-expires">Expires (optional)</Label>
                    <Input
                      id="feature-expires"
                      type="datetime-local"
                      value={featureExpires}
                      onChange={(e) => setFeatureExpires(e.target.value)}
                    />
                  </div>
                  <Button type="submit">Save override</Button>
                </form>

                <form
                  className="space-y-3 rounded-lg border p-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    limitFn({
                      data: {
                        companyId,
                        feature: limitFeature,
                        limitValue: Number(limitValue),
                        expiresAt: featureExpires ? new Date(featureExpires).toISOString() : null,
                        reason: reason || "Numeric limit override",
                        notes,
                      },
                    })
                      .then(() => {
                        toast.success("Limit override saved");
                        refresh();
                      })
                      .catch((error: unknown) =>
                        toast.error(error instanceof Error ? error.message : "Limit failed"),
                      );
                  }}
                >
                  <h3 className="font-medium">Numeric limit override</h3>
                  <div className="space-y-1">
                    <Label htmlFor="limit-feature">Feature key</Label>
                    <Input
                      id="limit-feature"
                      value={limitFeature}
                      onChange={(e) => setLimitFeature(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="limit-value">Limit</Label>
                    <Input
                      id="limit-value"
                      type="number"
                      min={0}
                      value={limitValue}
                      onChange={(e) => setLimitValue(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" variant="secondary">
                    Save limit
                  </Button>
                </form>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">View-only for your platform role.</p>
          )}

          {overrides.length > 0 ? (
            <div>
              <h3 className="mb-2 font-medium">Active overrides</h3>
              <ul className="space-y-1 text-sm">
                {overrides.map((row) => (
                  <li key={row.id} className="rounded border px-3 py-2">
                    <code>{row.featureKey}</code> · {row.effect} · {row.source}
                    {row.limitValue != null ? ` · limit ${row.limitValue}` : ""}
                    {row.expiresAt
                      ? ` · expires ${new Date(row.expiresAt).toLocaleDateString()}`
                      : " · permanent"}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {audit.length > 0 ? (
            <div>
              <h3 className="mb-2 font-medium">Recent audit</h3>
              <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                {audit.map((row) => (
                  <li key={row.id}>
                    {row.createdAt ? new Date(row.createdAt).toLocaleString() : ""} — {row.action}:{" "}
                    {row.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
