import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { quoteCustomerPlan } from "@/lib/billing/plan-quote.functions";
import { formatMinor, type BillingCurrency } from "@/lib/billing/pricing";
import { FEATURE_REGISTRY } from "@/lib/platform/feature-registry";

export const Route = createFileRoute("/pricing_/builder")({
  head: () => ({
    meta: [
      { title: "Plan builder — LinkBooks" },
      {
        name: "description",
        content: "Quote a LinkBooks plan and published add-ons. This page does not charge a card.",
      },
    ],
  }),
  component: PlanBuilderPage,
});

const ADD_ONS = FEATURE_REGISTRY.filter((feature) => feature.category === "add_on");

function money(amount: number | null, currency: BillingCurrency): string {
  return amount == null ? "No published price" : formatMinor(amount, currency);
}

function PlanBuilderPage() {
  const quote = useServerFn(quoteCustomerPlan);
  const [planCode, setPlanCode] = useState("pro");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const mutation = useMutation({
    mutationFn: () =>
      quote({
        data: {
          planCode,
          currency: null,
          selections: Object.entries(quantities)
            .filter(([, quantity]) => quantity > 0)
            .map(([featureKey, quantity]) => ({ featureKey, quantity })),
        },
      }),
  });
  const result = mutation.data;
  const currency = (result?.currency ?? "USD") as BillingCurrency;
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <header className="space-y-2">
        <p className="text-sm">
          <Link to="/pricing" className="underline">
            Pricing
          </Link>
        </p>
        <h1 className="text-3xl font-semibold">Plan builder</h1>
        <p className="text-sm text-muted-foreground">
          The quote uses the same published plan prices and live feature price book as the rest of
          LinkBooks. Tax is the operator-set rate on each price, not a filing position. This page
          does not charge a card or change a subscription.
        </p>
      </header>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <label className="block text-sm">
          Base plan
          <RecordLookupSelect
            className="mt-1 w-full rounded-md border bg-background px-3 py-2"
            aria-label="Base plan"
            value={planCode}
            onValueChange={setPlanCode}
          >
            {(result?.plans.length ? result.plans : [{ code: "pro", name: "Pro" }]).map((plan) => (
              <option key={plan.code} value={plan.code}>
                {plan.name}
              </option>
            ))}
          </RecordLookupSelect>
        </label>
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Optional features</legend>
          {ADD_ONS.map((feature) => (
            <label
              key={feature.key}
              className="grid grid-cols-[1fr_6rem] items-center gap-3 text-sm"
            >
              <span>
                {feature.name}
                {feature.comingSoon ? " (coming soon)" : ""}
                <span className="block text-muted-foreground">{feature.description}</span>
              </span>
              <input
                className="rounded-md border px-2 py-1"
                aria-label={`${feature.name} quantity`}
                type="number"
                min={0}
                max={100000}
                value={quantities[feature.key] ?? 0}
                onChange={(event) =>
                  setQuantities({ ...quantities, [feature.key]: Number(event.target.value) })
                }
              />
            </label>
          ))}
        </fieldset>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Calculating…" : "Calculate quote"}
        </Button>
      </form>
      {mutation.isError ? (
        <p role="alert">
          {mutation.error instanceof Error ? mutation.error.message : "Quote failed."}
        </p>
      ) : null}
      {result?.message ? <p role="status">{result.message}</p> : null}
      {result?.quote ? (
        <section className="space-y-3 rounded-lg border p-4" aria-live="polite">
          <h2 className="font-semibold">Quote in {currency}</h2>
          <p>
            Base plan monthly: {money(result.quote.planMonthlyMinor, currency)}. Yearly:{" "}
            {money(result.quote.planYearlyMinor, currency)}.
          </p>
          <ul className="space-y-1 text-sm">
            {result.quote.lines.map((line) => (
              <li key={line.featureKey}>
                {line.featureKey}: {money(line.monthlyNetMinor, currency)} a month net, tax{" "}
                {money(line.monthlyTaxMinor, currency)}. Yearly net{" "}
                {money(line.yearlyNetMinor, currency)}.
              </li>
            ))}
          </ul>
          <p>
            Monthly total: {money(result.quote.monthlyTotalMinor, currency)}. Yearly total:{" "}
            {money(result.quote.yearlyTotalMinor, currency)}.
          </p>
          <p>
            Yearly savings against twelve monthly totals:{" "}
            {money(result.quote.yearlySavingsMinor, currency)}.
          </p>
          {result.quote.issues.length ? (
            <ul role="alert">
              {result.quote.issues.map((issue) => (
                <li key={`${issue.featureKey}-${issue.message}`}>{issue.message}</li>
              ))}
            </ul>
          ) : (
            <p>Dependency rules are satisfied for the selected features.</p>
          )}
          <p className="text-sm text-muted-foreground">
            Removing a feature later hides or freezes it. Accounting history is kept. A mid-cycle
            charge is not calculated here because no test-mode payment provider is connected.
          </p>
        </section>
      ) : null}
    </main>
  );
}
