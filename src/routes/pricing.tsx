import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { listPublicBillingPlans } from "@/lib/billing/platform.functions";
import { formatMinor } from "@/lib/billing/pricing";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — LinkBooks" },
      {
        name: "description",
        content:
          "LinkBooks Standard, Pro and Business plans. Every plan runs on the same double-entry ledger, with a free trial and no card needed.",
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

type PlanFeature = {
  key: string;
  label: string;
  enabled: boolean;
  limit: number | null;
  metering?: string;
  availability: "available" | "coming_soon";
};

type PublicPlan = {
  code: string;
  name: string;
  audience: string;
  summary: string;
  badge: string | null;
  prices: PriceRow[] | null;
  trial?: { enabled: boolean; days: number } | null;
  features?: PlanFeature[] | null;
};

function featureText(feature: PlanFeature): string {
  if (feature.limit === null) return feature.label;
  if (feature.metering === "bytes") {
    const gigabytes = feature.limit / 1024 ** 3;
    return `${feature.label}: ${new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(gigabytes)} GB`;
  }
  return `${feature.label}: ${new Intl.NumberFormat("en").format(feature.limit)}`;
}

function PricingPage() {
  const load = useServerFn(listPublicBillingPlans);
  const query = useQuery({
    queryKey: ["public-billing-plans"],
    queryFn: () => load(),
    retry: false,
  });
  const [interval, setInterval] = useState<"month" | "year">("month");
  const currency = query.data?.currency ?? "USD";
  const region = query.data?.country ?? "US";
  const locationSource = query.data?.source ?? "fallback";
  const [signedIn, setSignedIn] = useState(false);
  const plans = (Array.isArray(query.data?.plans) ? query.data.plans : []) as PublicPlan[];
  const anyPriced = plans.some((plan) => (plan.prices ?? []).length > 0);
  const trialDays = plans.find((plan) => plan.trial?.enabled)?.trial?.days ?? null;

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSignedIn(Boolean(data.session));
    });
  }, []);

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Pricing</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Every plan includes the same double-entry ledger. Prices exclude local tax.
          {trialDays
            ? ` A new organisation starts a ${trialDays}-day free trial with no card.`
            : ""}{" "}
          You can cancel, and existing reports and files stay available.
        </p>
      </header>
      <div className="flex flex-wrap gap-3">
        {anyPriced ? (
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
              Yearly
            </button>
          </div>
        ) : null}
        <Button type="button" variant="outline" asChild>
          <Link to="/pricing/builder">Build a quote</Link>
        </Button>
        {anyPriced ? (
          <p className="self-center text-sm text-muted-foreground" role="status">
            {locationSource === "fallback"
              ? "Prices shown in USD because your region could not be detected."
              : `Prices automatically shown in ${currency} for ${new Intl.DisplayNames(["en"], { type: "region" }).of(region) ?? region}.`}
          </p>
        ) : null}
      </div>
      {query.isLoading ? <p>Loading plans…</p> : null}
      {query.isError ? (
        <p>{query.error instanceof Error ? query.error.message : "Plans could not be loaded."}</p>
      ) : null}
      {query.data?.ready === false ? (
        <p>Published prices appear here after the billing migration is applied.</p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {plans.map((plan) => {
          const price = plan.prices?.find(
            (row) => row.currency === currency && row.interval === interval,
          );
          const included = (plan.features ?? []).filter((feature) => feature.enabled);
          const action = plan.trial?.enabled ? "Start free trial" : "Subscribe";
          const destination = `/settings?section=subscription&plan=${plan.code}&interval=${interval}`;
          return (
            <article key={plan.code} className="flex flex-col gap-2 rounded-lg border p-4">
              <h2 className="text-lg font-semibold">{plan.name}</h2>
              {plan.badge ? <p className="text-xs font-medium">{plan.badge}</p> : null}
              <p className="text-sm text-muted-foreground">{plan.summary}</p>
              {price ? (
                <p className="text-2xl font-semibold">
                  {formatMinor(price.amountMinor, currency)}
                  <span className="text-sm font-normal text-muted-foreground">
                    {" "}
                    / {interval === "year" ? "year" : "month"}
                  </span>
                </p>
              ) : (
                <p className="text-xl font-semibold">Price coming soon</p>
              )}
              {price?.needsReview ? (
                <p className="text-xs text-muted-foreground">Regional price pending review.</p>
              ) : null}
              {plan.trial?.enabled ? (
                <p className="text-xs text-muted-foreground">
                  {plan.trial.days}-day free trial, no card needed
                </p>
              ) : null}
              <Button type="button" asChild>
                {signedIn ? (
                  <Link
                    to="/settings"
                    search={{ section: "subscription", plan: plan.code, interval }}
                  >
                    {action}
                  </Link>
                ) : (
                  <Link to="/auth" search={{ redirect: destination }}>
                    {action}
                  </Link>
                )}
              </Button>
              {included.length ? (
                <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                  {included.map((feature) => (
                    <li key={feature.key} className="flex gap-2">
                      {feature.availability === "coming_soon" ? (
                        <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
                      ) : (
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                      )}
                      <span>
                        {featureText(feature)}
                        {feature.availability === "coming_soon" ? " (coming soon)" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          );
        })}
      </div>
      <section className="space-y-2 text-sm">
        <h2 className="text-lg font-semibold">Questions</h2>
        {trialDays ? (
          <p>
            The free trial lasts {trialDays} days, needs no card and is available once per person.
          </p>
        ) : null}
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
