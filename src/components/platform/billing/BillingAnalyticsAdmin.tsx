import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { Button } from "@/components/ui/button";
import {
  ANALYTICS_RANGES,
  analyticsRange,
  netRevenueMinor,
  saveRate,
  type AnalyticsRangeId,
} from "@/lib/billing/domain/analytics";
import { formatMinorAmount } from "@/lib/billing/domain/money";
import {
  getBillingAnalytics,
  type BillingAnalytics,
} from "@/lib/billing/billing-analytics.functions";

function money(minor: number, currency: string): string {
  return formatMinorAmount(BigInt(minor), currency);
}

function counts(record: Record<string, number>): string {
  const entries = Object.entries(record).sort((a, b) => b[1] - a[1]);
  return entries.length ? entries.map(([key, value]) => `${key} ${value}`).join(" · ") : "none";
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold">{value}</dd>
      {note ? <dd className="text-xs text-muted-foreground">{note}</dd> : null}
    </div>
  );
}

export function BillingAnalyticsAdmin() {
  const load = useServerFn(getBillingAnalytics);
  const [rangeId, setRangeId] = useState<AnalyticsRangeId>("30d");
  const query = useQuery({
    queryKey: ["platform-billing-analytics", rangeId],
    queryFn: () => load({ data: analyticsRange(rangeId, new Date()) }),
    retry: false,
  });
  return (
    <section className="space-y-4" aria-labelledby="billing-analytics-heading">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h2 id="billing-analytics-heading" className="text-xl font-semibold">
            Billing analytics
          </h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Figures are per currency in the currency charged; nothing is converted. Demo
            organisations are excluded from subscription figures.
          </p>
        </div>
        <label className="text-sm">
          Period
          <select
            className="mt-1 flex h-9 rounded-md border bg-transparent px-2"
            value={rangeId}
            onChange={(e) => setRangeId(e.target.value as AnalyticsRangeId)}
          >
            {/* lookup-fixed-enum: Reporting period presets, not selectable business records. */}
            {ANALYTICS_RANGES.map((range) => (
              <option key={range.id} value={range.id}>
                {range.label}
              </option>
            ))}
          </select>
        </label>
      </header>
      {query.isLoading ? <p className="text-sm text-muted-foreground">Loading analytics…</p> : null}
      {query.isError ? (
        <QueryErrorState queries={[query]} title="Could not load billing analytics" />
      ) : null}
      {query.isSuccess && query.data ? <AnalyticsBody data={query.data} /> : null}
    </section>
  );
}

function AnalyticsBody({ data }: { data: BillingAnalytics }) {
  const life = data.lifecycle;
  const rate = saveRate(life.cancellationsRequested, life.cancellationsReversed);
  return (
    <div className="space-y-5">
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {data.mrr.length === 0 ? (
          <Stat label="MRR" value="None" note="No active paid subscriptions" />
        ) : (
          data.mrr.map((row) => (
            <Stat
              key={row.currency}
              label={`MRR ${row.currency}`}
              value={money(row.mrrMinor, row.currency)}
              note={`ARR ${money(row.arrMinor, row.currency)} · ${row.subscriptions} subscriptions`}
            />
          ))
        )}
        <Stat
          label="Trials"
          value={`${life.trialsStarted} started`}
          note={`${life.trialsExpired} expired · ${life.activations} activated`}
        />
        <Stat
          label="Cancellations"
          value={`${life.cancellationsRequested} requested`}
          note={`${life.cancelled} ended · saved ${rate === null ? "n/a" : `${Math.round(rate * 100)}%`}`}
        />
        <Stat
          label="Payments"
          value={`${life.renewals} renewals`}
          note={`${life.failedPayments} failed payments`}
        />
      </dl>

      <div className="space-y-1 text-sm">
        <h3 className="font-medium">Subscriptions</h3>
        <p>Status: {counts(data.subscriptions.byStatus)}</p>
        <p>Paid plans: {counts(data.subscriptions.byPlan)}</p>
        <p>Countries: {counts(data.subscriptions.byCountry)}</p>
      </div>

      <div className="space-y-1">
        <h3 className="font-medium">Revenue</h3>
        {data.revenue.length === 0 ? (
          <p className="text-sm text-muted-foreground">No invoices in this period.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1">Currency</th>
                <th className="text-right">Invoiced</th>
                <th className="text-right">Tax</th>
                <th className="text-right">Discounts</th>
                <th className="text-right">Credited</th>
                <th className="text-right">Refunded</th>
                <th className="text-right">Net revenue</th>
              </tr>
            </thead>
            <tbody>
              {data.revenue.map((row) => (
                <tr key={row.currency} className="border-t">
                  <td className="py-1">
                    {row.currency} ({row.invoices})
                  </td>
                  <td className="text-right">{money(row.grossMinor, row.currency)}</td>
                  <td className="text-right">{money(row.taxMinor, row.currency)}</td>
                  <td className="text-right">{money(row.discountMinor, row.currency)}</td>
                  <td className="text-right">{money(row.creditedMinor, row.currency)}</td>
                  <td className="text-right">{money(row.refundsMinor, row.currency)}</td>
                  <td className="text-right">{money(netRevenueMinor(row), row.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="space-y-1 text-sm">
        <h3 className="font-medium">MRR movements</h3>
        {data.movements.length === 0 ? (
          <p className="text-muted-foreground">
            No captured movements in this period.
            {data.lastMrrCapture
              ? ` Last capture ${new Date(data.lastMrrCapture).toLocaleString()}.`
              : " MRR has not been captured yet."}
          </p>
        ) : (
          <ul>
            {data.movements.map((row) => (
              <li key={`${row.currency}-${row.movement}`}>
                {row.currency} {row.movement}: {row.count} · {money(row.deltaMinor, row.currency)}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-4 text-sm sm:grid-cols-2">
        <div className="space-y-1">
          <h3 className="font-medium">Promo codes</h3>
          <p>
            {data.coupons.length
              ? data.coupons.map((row) => `${row.code} ${row.redemptions}`).join(" · ")
              : "No redemptions in this period."}
          </p>
          <p>Cancellation reasons: {counts(life.cancellationReasons)}</p>
        </div>
        <div className="space-y-1">
          <h3 className="font-medium">Partners</h3>
          <p>{data.partners.activeReferrals} active referrals</p>
          {data.partners.commission.map((row) => (
            <p key={row.currency}>
              {row.currency}: accrued {money(row.accruedMinor, row.currency)}, reversed{" "}
              {money(row.reversedMinor, row.currency)}, paid {money(row.paidOutMinor, row.currency)}
            </p>
          ))}
        </div>
      </div>

      <div className="space-y-1 text-sm">
        <h3 className="font-medium">Operations</h3>
        <p className={data.webhooks.dead || data.invoicesPending ? "text-destructive" : undefined}>
          Webhooks: {data.webhooks.received} received · {data.webhooks.backlog} waiting ·{" "}
          {data.webhooks.dead} dead
          {data.webhooks.oldestBacklogAt
            ? ` · oldest waiting since ${new Date(data.webhooks.oldestBacklogAt).toLocaleString()}`
            : ""}{" "}
          · {data.invoicesPending} payments waiting for an invoice
        </p>
      </div>
    </div>
  );
}
