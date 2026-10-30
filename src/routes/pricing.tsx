import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listPublicBillingPlans } from "@/lib/billing/platform.functions";
import { formatMinor, type BillingCurrency } from "@/lib/billing/pricing";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — LinkBooks" },
      {
        name: "description",
        content:
          "LinkBooks plans from $12 a month. Annual billing is two months free. Tax is extra. Cancel any time.",
      },
    ],
  }),
  component: PricingPage,
});

type PriceRow = {
  currency: string;
  interval: string;
  amountMinor: number;
  needsReview: boolean;
};

type PublicPlan = {
  code: string;
  name: string;
  audience: string;
  summary: string;
  badge: string | null;
  prices: PriceRow[] | null;
};

const CURRENCIES: BillingCurrency[] = ["USD", "GBP", "AUD", "NZD", "INR"];

function PricingPage() {
  const load = useServerFn(listPublicBillingPlans);
  const query = useQuery({
    queryKey: ["public-billing-plans"],
    queryFn: () => load(),
  });
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [currency, setCurrency] = useState<BillingCurrency>("USD");
  const plans = (Array.isArray(query.data?.plans) ? query.data.plans : []) as PublicPlan[];

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Pricing</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Every paid plan includes the same double-entry ledger. Annual billing is ten times the
          monthly price, which is two months free. Prices exclude local tax. A new organisation
          starts a 14-day Growth trial with no card. You can cancel, and existing reports and files
          stay available.
        </p>
      </header>
      <div className="flex flex-wrap gap-3">
        <div
          className="inline-flex rounded-md border p-1"
          role="group"
          aria-label="Billing interval"
        >
          <button
            type="button"
            className={
              interval === "month"
                ? "rounded bg-primary px-3 py-1 text-sm text-primary-foreground"
                : "px-3 py-1 text-sm"
            }
            aria-pressed={interval === "month"}
            onClick={() => setInterval("month")}
          >
            Monthly
          </button>
          <button
            type="button"
            className={
              interval === "year"
                ? "rounded bg-primary px-3 py-1 text-sm text-primary-foreground"
                : "px-3 py-1 text-sm"
            }
            aria-pressed={interval === "year"}
            onClick={() => setInterval("year")}
          >
            Yearly, 2 months free
          </button>
        </div>
        <label className="text-sm">
          Currency{" "}
          <select
            className="rounded-md border bg-transparent px-2 py-1"
            value={currency}
            aria-label="Currency"
            onChange={(event) => setCurrency(event.target.value as BillingCurrency)}
          >
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
      </div>
      {query.isLoading ? <p>Loading plans…</p> : null}
      {query.isError ? (
        <p>{query.error instanceof Error ? query.error.message : "Plans could not be loaded."}</p>
      ) : null}
      {query.data?.ready === false ? (
        <p>Published prices appear here after the billing migration is applied.</p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => {
          const price = plan.prices?.find(
            (row) => row.currency === currency && row.interval === interval,
          );
          return (
            <article key={plan.code} className="space-y-2 rounded-lg border p-4">
              <h2 className="text-lg font-semibold">{plan.name}</h2>
              {plan.badge ? <p className="text-xs font-medium">{plan.badge}</p> : null}
              <p className="text-sm text-muted-foreground">{plan.summary}</p>
              <p className="text-2xl font-semibold">
                {price ? formatMinor(price.amountMinor, currency) : "Price on request"}
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  / {interval === "year" ? "year" : "month"}
                </span>
              </p>
              {price?.needsReview ? (
                <p className="text-xs text-muted-foreground">Regional price pending review.</p>
              ) : null}
            </article>
          );
        })}
      </div>
      <section className="space-y-2 text-sm">
        <h2 className="text-lg font-semibold">Questions</h2>
        <p>
          The trial is 14 days of Growth and does not ask for a card unless an operator changes that
          setting.
        </p>
        <p>
          Promo codes discount an introductory period. The list price above is what renews after
          that period.
        </p>
        <p>Downgrading does not delete data. Records above the new limit stay readable.</p>
        <p>
          <Link to="/auth" className="underline">
            Sign in
          </Link>{" "}
          to start a trial from an organisation.
        </p>
      </section>
    </main>
  );
}
