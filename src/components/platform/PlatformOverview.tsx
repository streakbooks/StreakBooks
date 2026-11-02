import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";
import {
  getPlatformMrrReconciliation,
  getPlatformOverview,
} from "@/lib/platform/platform.functions";
import { formatConsoleInstant, formatUtcDay } from "@/lib/platform/console-time";
import { revenueCardState } from "@/lib/platform/revenue-metrics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function PlatformOverview({ allowedSections }: { allowedSections: readonly string[] }) {
  const [range, setRange] = useState(() => {
    const end = new Date().toISOString().slice(0, 10);
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 29);
    return { from: d.toISOString().slice(0, 10), to: end };
  });
  const load = useServerFn(getPlatformOverview);
  const loadReconciliation = useServerFn(getPlatformMrrReconciliation);
  const query = useQuery({
    queryKey: ["platform", "overview", range],
    queryFn: () => load({ data: range }),
    retry: false,
  });
  const reconciliation = useQuery({
    queryKey: ["platform", "mrr-reconciliation"],
    queryFn: () => loadReconciliation(),
    retry: false,
  });
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          Registration start
          <Input
            aria-label="Registration start"
            type="date"
            value={range.from}
            onChange={(e) => setRange({ ...range, from: e.target.value })}
          />
        </label>
        <label className="text-sm">
          Registration end
          <Input
            aria-label="Registration end"
            type="date"
            value={range.to}
            onChange={(e) => setRange({ ...range, to: e.target.value })}
          />
        </label>
        <Button variant="outline" onClick={() => void query.refetch()}>
          Refresh metrics
        </Button>
      </div>
      {query.isPending ? (
        <p role="status">Loading verified metrics…</p>
      ) : query.isError ? (
        <p role="alert" className="text-destructive">
          {query.error.message}
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Current snapshot · {formatConsoleInstant(query.data.measuredAt)} · Registration dates
            are UTC calendar days ({formatUtcDay(range.from)} to {formatUtcDay(range.to)}). Demo
            businesses excluded. Active users signed in within 30 days.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {(
              [
                ["Registered businesses", query.data.businesses, "businesses"],
                ["Active businesses", query.data.activeBusinesses, "businesses"],
                ["Inactive businesses", query.data.inactiveBusinesses, "businesses"],
                ["Suspended businesses", query.data.suspendedBusinesses, "businesses"],
                ["Live trials", query.data.trialAccounts, "subscriptions"],
                ["Registered users", query.data.users, "users"],
                ["Active users · 30 days", query.data.activeUsers, "users"],
                ["Accounting firms", query.data.firms, "firms"],
                ["Subscriptions", query.data.subscriptions, "subscriptions"],
                ["Cancelled / cancelling", query.data.cancellations, "subscriptions"],
                ["Past due subscriptions", query.data.pastDue, "subscriptions"],
              ] as const
            ).map(([title, value, section]) => {
              const content = (
                <>
                  <span className="text-sm text-muted-foreground">{title}</span>
                  <strong className="mt-2 block text-3xl tracking-tight">
                    {Number(value).toLocaleString()}
                  </strong>
                </>
              );
              const style = "rounded-xl border bg-card p-5 text-left shadow-sm transition hover:border-primary focus-visible:outline-2 focus-visible:outline-primary";
              return allowedSections.includes(section) ? (
                <Link key={title} to="/platform" search={{ section }} className={style}>
                  {content}
                </Link>
              ) : (
                <div key={title} className={style}>{content}</div>
              );
            })}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border bg-card p-5">
              <h2 className="mb-4 font-semibold">Business registrations</h2>
              <div
                className="h-64"
                role="img"
                aria-label="Daily business registrations for the selected date range"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={query.data.registrations}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" tickFormatter={(v) => String(v).slice(5)} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Area type="monotone" dataKey="businesses" stroke="#2563eb" fill="#dbeafe" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>
            <section className="rounded-xl border bg-card p-5">
              <h2 className="mb-4 font-semibold">Subscription plan distribution</h2>
              {query.data.plans.length ? (
                <div className="h-64" role="img" aria-label="Subscriptions grouped by plan">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={query.data.plans}>
                      <XAxis dataKey="plan_code" />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="subscriptions" fill="#2563eb" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p>No subscription records.</p>
              )}
            </section>
          </div>
          <section className="rounded-xl border bg-card p-5">
            <h2 className="font-semibold">Recurring revenue</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Active paid subscriptions, normalized monthly. Annual contracts divide by 12. No
              currency conversion or trial revenue.
            </p>
            {revenueCardState({
              revenueState: query.data.revenueState,
              rows: query.data.revenue,
            }) === "forbidden" ? (
              <p className="mt-4 text-sm" role="status">
                Billing permission is required to view revenue. This is not a zero balance.
              </p>
            ) : revenueCardState({
                revenueState: query.data.revenueState,
                rows: query.data.revenue,
              }) === "empty" ? (
              <p className="mt-4 text-sm" role="status">
                No eligible active subscriptions with a stored price. Permission to view billing is
                present. This is an empty result, not a zero balance and not a permissions error.
              </p>
            ) : revenueCardState({
                revenueState: query.data.revenueState,
                rows: query.data.revenue,
              }) === "unseparated" ? (
              <p className="mt-4 text-sm" role="status">
                {query.data.revenue.length
                  ? "Revenue rows are shown, but this server did not label whether an empty result would mean no data or no permission."
                  : "No revenue rows were returned, and this server did not say whether that is an empty result or a missing billing permission. Do not treat it as zero."}
              </p>
            ) : query.data.revenue.length ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {query.data.revenue.map((r) => (
                  <div key={r.currency} className="rounded-lg bg-muted p-4">
                    <strong>{r.currency}</strong>
                    <p>
                      MRR:{" "}
                      {(
                        Number(r.mrr_minor) /
                        10 **
                          (new Intl.NumberFormat("en", {
                            style: "currency",
                            currency: r.currency,
                          }).resolvedOptions().maximumFractionDigits ?? 2)
                      ).toLocaleString()}
                    </p>
                    <p>
                      ARR:{" "}
                      {(
                        Number(r.arr_minor) /
                        10 **
                          (new Intl.NumberFormat("en", {
                            style: "currency",
                            currency: r.currency,
                          }).resolvedOptions().maximumFractionDigits ?? 2)
                      ).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm" role="status">
                Billing permission is present and the snapshot is eligible, but no currency row was
                returned. This is not a zero balance and not a permissions error.
              </p>
            )}
            <div className="mt-4 border-t pt-4 text-sm">
              <h3 className="font-medium">Stored movement check</h3>
              {reconciliation.isPending ? (
                <p className="mt-2" role="status">
                  Checking stored MRR…
                </p>
              ) : reconciliation.isError ? (
                <p className="mt-2" role="alert">
                  {reconciliation.error instanceof Error
                    ? reconciliation.error.message
                    : "MRR reconciliation failed."}
                </p>
              ) : reconciliation.data?.message ? (
                <p className="mt-2" role="status">
                  {reconciliation.data.message}
                </p>
              ) : reconciliation.data?.state === "forbidden" ? (
                <p className="mt-2" role="status">
                  Billing permission is required to reconcile stored MRR. This is not a zero
                  balance.
                </p>
              ) : reconciliation.data?.state === "empty" ? (
                <p className="mt-2" role="status">
                  No recognised MRR and no open stored movement. This is an empty result, not a zero
                  balance.
                </p>
              ) : reconciliation.data?.state === "uncovered" ? (
                <p className="mt-2" role="status">
                  Recognised MRR has no stored movement yet.{" "}
                  {reconciliation.data.missingFromStore.toLocaleString()} businesses are missing
                  from history. Do not treat that gap as zero.
                </p>
              ) : reconciliation.data?.state === "match" ? (
                <p className="mt-2" role="status">
                  The latest stored position matches the overview for every currency.
                </p>
              ) : reconciliation.data?.state === "mismatch" ? (
                <p className="mt-2" role="status">
                  Stored MRR does not match the overview. Missing from history:{" "}
                  {reconciliation.data.missingFromStore.toLocaleString()}. Open in history only:{" "}
                  {reconciliation.data.extraInStore.toLocaleString()}. Amount or currency drift:{" "}
                  {reconciliation.data.drift.toLocaleString()}.
                </p>
              ) : null}
              {reconciliation.data?.rows.length ? (
                <ul className="mt-2 space-y-1">
                  {reconciliation.data.rows.map((row) => (
                    <li key={row.currency}>
                      {row.currency}: overview {row.overviewMinor.toLocaleString()} minor, stored{" "}
                      {row.storedMinor.toLocaleString()} minor, difference{" "}
                      {row.differenceMinor.toLocaleString()} minor.
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
