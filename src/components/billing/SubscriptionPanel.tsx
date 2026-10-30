import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  claimBillingOperator,
  createBillingCheckout,
  getBillingOverview,
  previewBillingQuote,
  saveBillingOffer,
  saveBillingPlan,
  saveBillingSettings,
  type BillingOfferView,
  type BillingOverview,
  type BillingPlanView,
} from "@/lib/billing/billing.functions";
import {
  formatMinor,
  listAmount,
  type BillingInterval,
  type PriceQuote,
} from "@/lib/billing/pricing";

const billingKey = (companyId: string) => ["billing-overview", companyId] as const;

export function SubscriptionPanel({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient();
  const fetchOverview = useServerFn(getBillingOverview);
  const preview = useServerFn(previewBillingQuote);
  const startCheckout = useServerFn(createBillingCheckout);
  const saveSettings = useServerFn(saveBillingSettings);
  const savePlan = useServerFn(saveBillingPlan);
  const saveOffer = useServerFn(saveBillingOffer);
  const claim = useServerFn(claimBillingOperator);
  const overview = useQuery({
    queryKey: billingKey(companyId),
    queryFn: () => fetchOverview({ data: { companyId } }),
  });
  const [interval, setInterval] = useState<BillingInterval>("month");
  const [offerCode, setOfferCode] = useState("");
  const [appliedCode, setAppliedCode] = useState("");
  const [quotes, setQuotes] = useState<Record<string, PriceQuote>>({});
  const data = overview.data;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    if (checkout === "success") {
      toast.success("Payment submitted. Access updates when the provider confirms it.");
    } else if (checkout === "cancel") {
      toast.message("Checkout was cancelled. No charge was made.");
    }
  }, []);

  async function applyCode() {
    if (!data) return;
    const code = offerCode.trim();
    if (!code) {
      setAppliedCode("");
      setQuotes({});
      return;
    }
    if (!data.ready) {
      toast.error(data.message ?? "Subscriptions are not available yet.");
      return;
    }
    const targets = data.plans.filter((plan) => plan.active);
    if (targets.length === 0) {
      toast.error("There are no active plans to price.");
      return;
    }
    try {
      const entries = await Promise.all(
        targets.map(async (plan) => {
          const quote = await preview({
            data: { companyId, planCode: plan.code, interval, offerCode: code },
          });
          return [plan.code, quote] as const;
        }),
      );
      setQuotes(Object.fromEntries(entries));
      setAppliedCode(code);
      toast.success("Promo code applied to the prices below.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That promo code could not be applied.");
    }
  }

  const checkout = useMutation({
    mutationFn: (input: { planCode: string; provider: "stripe" | "razorpay" }) =>
      startCheckout({
        data: {
          companyId,
          planCode: input.planCode,
          interval,
          provider: input.provider,
          origin: window.location.origin,
          offerCode: appliedCode,
        },
      }),
    onSuccess: (result) => {
      window.location.assign(result.url);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Checkout could not be started.");
    },
  });

  if (overview.isLoading)
    return <p className="text-sm text-muted-foreground">Loading subscription…</p>;
  if (overview.isError || !data) {
    return (
      <p className="text-sm text-destructive">
        {overview.error instanceof Error
          ? overview.error.message
          : "Subscription details could not be loaded."}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <SubscriptionStatus data={data} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="inline-flex rounded-md border p-1">
          <Button
            type="button"
            size="sm"
            variant={interval === "month" ? "default" : "ghost"}
            onClick={() => {
              setInterval("month");
              setQuotes({});
            }}
          >
            Monthly
          </Button>
          <Button
            type="button"
            size="sm"
            variant={interval === "year" ? "default" : "ghost"}
            onClick={() => {
              setInterval("year");
              setQuotes({});
            }}
          >
            Annual
            {data.settings.annualFreeMonths > 0
              ? ` · ${data.settings.annualFreeMonths} months free`
              : ""}
          </Button>
        </div>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void applyCode();
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="promo-code">Promo code</Label>
            <Input
              id="promo-code"
              value={offerCode}
              onChange={(event) => setOfferCode(event.target.value.toUpperCase())}
              placeholder="WELCOME20"
              className="w-40"
              autoComplete="off"
            />
          </div>
          <Button type="submit" variant="outline">
            Apply
          </Button>
        </form>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {data.plans
          .filter((plan) => plan.active)
          .map((plan) => (
            <PlanCard
              key={plan.code}
              plan={plan}
              overview={data}
              interval={interval}
              quote={quotes[plan.code] ?? null}
              current={data.subscription?.planCode === plan.code}
              busy={checkout.isPending}
              onCheckout={(provider) => checkout.mutate({ planCode: plan.code, provider })}
            />
          ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Prices are per organisation and exclude local tax. Starter is level with Zoho Standard and
        Wave Pro. Standard and Premium sit under Xero, QuickBooks Online and FreshBooks. The posting
        engine is the same on every plan. A new organisation starts a {data.settings.trialDays}-day{" "}
        {data.settings.trialPlanCode} trial with no card. Card checkout uses Stripe. India checkout
        uses Razorpay when those keys are configured.
      </p>
      <OperatorEditor
        data={data}
        onClaim={() =>
          claim()
            .then(() => {
              toast.success("You are a billing operator.");
              void queryClient.invalidateQueries({ queryKey: billingKey(companyId) });
            })
            .catch((error: unknown) => {
              toast.error(error instanceof Error ? error.message : "Could not add the operator.");
            })
        }
        onSaveSettings={(input) =>
          saveSettings({ data: input })
            .then(() => {
              toast.success("Trial and annual terms saved.");
              void queryClient.invalidateQueries({ queryKey: billingKey(companyId) });
            })
            .catch((error: unknown) =>
              toast.error(error instanceof Error ? error.message : "Could not save."),
            )
        }
        onSavePlan={(plan) =>
          savePlan({
            data: {
              code: plan.code,
              monthlyGbp: plan.monthlyGbp,
              monthlyUsd: plan.monthlyUsd,
              monthlyInr: plan.monthlyInr,
              users: plan.users,
              invoicesPerMonth: plan.invoicesPerMonth,
              billsPerMonth: plan.billsPerMonth,
              multiCurrency: plan.multiCurrency,
              active: plan.active,
            },
          })
            .then(() => {
              toast.success(`${plan.code} saved.`);
              void queryClient.invalidateQueries({ queryKey: billingKey(companyId) });
            })
            .catch((error: unknown) =>
              toast.error(error instanceof Error ? error.message : "Could not save the plan."),
            )
        }
        onSaveOffer={(offer) =>
          saveOffer({ data: offer })
            .then(() => {
              toast.success("Offer saved.");
              void queryClient.invalidateQueries({ queryKey: billingKey(companyId) });
            })
            .catch((error: unknown) =>
              toast.error(error instanceof Error ? error.message : "Could not save the offer."),
            )
        }
      />
    </div>
  );
}

function SubscriptionStatus({ data }: { data: BillingOverview }) {
  const sub = data.subscription;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">This organisation</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {data.message ? <p>{data.message}</p> : null}
        {sub ? (
          <p>
            <Badge variant="secondary">{statusLabel(sub.status)}</Badge>{" "}
            <span className="font-medium">{sub.planName}</span>
            {sub.trialEndsAt && sub.status === "trialing"
              ? ` · trial ends ${new Date(sub.trialEndsAt).toLocaleDateString()}`
              : ""}
            {sub.currentPeriodEnd
              ? ` · renews or ends ${new Date(sub.currentPeriodEnd).toLocaleDateString()}`
              : ""}
            {sub.provider !== "none" ? ` · ${sub.provider}` : ""}
          </p>
        ) : (
          <p>No subscription is recorded yet.</p>
        )}
        <p className="text-muted-foreground">
          This month: {data.usage.invoicesThisMonth} invoices, {data.usage.billsThisMonth} bills,{" "}
          {data.usage.users} users. Prices shown in {data.currency}.
        </p>
      </CardContent>
    </Card>
  );
}

function PlanCard({
  plan,
  overview,
  interval,
  quote,
  current,
  busy,
  onCheckout,
}: {
  plan: BillingPlanView;
  overview: BillingOverview;
  interval: BillingInterval;
  quote: PriceQuote | null;
  current: boolean;
  busy: boolean;
  onCheckout: (provider: "stripe" | "razorpay") => void;
}) {
  const list = listAmount(plan.monthlyMinor, interval, overview.settings.annualFreeMonths);
  const due = quote?.dueMinor ?? list;
  return (
    <Card className={current ? "border-primary" : undefined}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          {plan.name}
          {current ? <Badge>Current</Badge> : null}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{plan.audience}</p>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>
          <span className="text-2xl font-semibold">{formatMinor(due, overview.currency)}</span>{" "}
          <span className="text-muted-foreground">
            {interval === "year" ? "per year" : "per month"}
          </span>
        </p>
        {quote && quote.discountMinor > 0 ? (
          <p className="text-xs text-muted-foreground">
            List {formatMinor(quote.listMinor, overview.currency)} with {quote.offerCode}
          </p>
        ) : null}
        <p>{plan.summary}</p>
        <ul className="space-y-1 text-muted-foreground">
          {plan.highlights.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {overview.isDemo ? null : (
          <div className="flex flex-col gap-2">
            {overview.providers.stripe ? (
              <Button type="button" disabled={busy} onClick={() => onCheckout("stripe")}>
                Pay with card
              </Button>
            ) : null}
            {overview.providers.razorpay ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => onCheckout("razorpay")}
              >
                Pay with Razorpay
              </Button>
            ) : null}
            {!overview.providers.stripe && !overview.providers.razorpay ? (
              <p className="text-xs text-muted-foreground">
                Card checkout is waiting for STRIPE_SECRET_KEY, or RAZORPAY_KEY_ID and
                RAZORPAY_KEY_SECRET. The trial does not need a card.
              </p>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function statusLabel(status: string): string {
  if (status === "trialing") return "Trial";
  if (status === "active") return "Active";
  if (status === "past_due") return "Payment due";
  if (status === "complimentary") return "Complimentary";
  if (status === "cancelled") return "Cancelled";
  if (status === "expired") return "Ended";
  return status;
}

function OperatorEditor({
  data,
  onClaim,
  onSaveSettings,
  onSavePlan,
  onSaveOffer,
}: {
  data: BillingOverview;
  onClaim: () => void;
  onSaveSettings: (input: {
    trialDays: number;
    trialPlanCode: string;
    annualFreeMonths: number;
    pastDueGraceDays: number;
  }) => void;
  onSavePlan: (plan: {
    code: string;
    monthlyGbp: number;
    monthlyUsd: number;
    monthlyInr: number;
    users: number;
    invoicesPerMonth: number | null;
    billsPerMonth: number | null;
    multiCurrency: boolean;
    active: boolean;
  }) => void;
  onSaveOffer: (offer: BillingOfferView) => void;
}) {
  const [trialDays, setTrialDays] = useState(String(data.settings.trialDays));
  const [trialPlan, setTrialPlan] = useState(data.settings.trialPlanCode);
  const [freeMonths, setFreeMonths] = useState(String(data.settings.annualFreeMonths));
  const [grace, setGrace] = useState(String(data.settings.pastDueGraceDays));
  const [offer, setOffer] = useState<BillingOfferView>({
    code: "",
    name: "",
    kind: "percent",
    percentBps: 2000,
    amountMinor: 0,
    amountCurrency: data.currency,
    extraTrialDays: 0,
    extraFreeMonths: 0,
    intervals: "any",
    planCodes: [],
    startsOn: null,
    endsOn: null,
    maxRedemptions: null,
    redemptionCount: 0,
    active: false,
  });

  if (!data.ready) return null;
  if (!data.isOperator) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Offers and plan prices</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Until a billing operator is recorded, an organisation owner can claim this. After that,
            only operators can change prices, the trial, annual free months and promo codes.
          </p>
          <Button type="button" variant="outline" onClick={onClaim}>
            Become the billing operator
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Trial and annual terms</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3 sm:grid-cols-4"
            onSubmit={(event) => {
              event.preventDefault();
              onSaveSettings({
                trialDays: Number(trialDays),
                trialPlanCode: trialPlan,
                annualFreeMonths: Number(freeMonths),
                pastDueGraceDays: Number(grace),
              });
            }}
          >
            <Field label="Trial days" value={trialDays} onChange={setTrialDays} />
            <label className="space-y-1 text-sm">
              <span>Trial plan</span>
              <select
                className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                value={trialPlan}
                onChange={(event) => setTrialPlan(event.target.value)}
              >
                {data.plans.map((plan) => (
                  <option key={plan.code} value={plan.code}>
                    {plan.name}
                  </option>
                ))}
              </select>
            </label>
            <Field label="Annual months free" value={freeMonths} onChange={setFreeMonths} />
            <Field label="Grace days" value={grace} onChange={setGrace} />
            <Button type="submit" className="sm:col-span-4 sm:w-fit">
              Save terms
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Plan prices</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Amounts are minor units: pence, cents or paise.
          </p>
          {data.plans.map((plan) => (
            <PlanEditor key={plan.code} plan={plan} onSave={onSavePlan} />
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Promo codes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.offers.length > 0 ? (
            <ul className="space-y-1 text-sm">
              {data.offers.map((row) => (
                <li key={row.code}>
                  <button type="button" className="underline" onClick={() => setOffer(row)}>
                    {row.code}
                  </button>{" "}
                  <span className="text-muted-foreground">
                    {row.name} · {row.active ? "active" : "inactive"} · {row.redemptionCount} used
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No offers yet. WELCOME20 is seeded inactive.
            </p>
          )}
          <form
            className="grid gap-3 sm:grid-cols-3"
            onSubmit={(event) => {
              event.preventDefault();
              onSaveOffer(offer);
            }}
          >
            <Field
              label="Code"
              value={offer.code}
              onChange={(code) => setOffer({ ...offer, code })}
            />
            <Field
              label="Name"
              value={offer.name}
              onChange={(name) => setOffer({ ...offer, name })}
            />
            <label className="space-y-1 text-sm">
              <span>Kind</span>
              <select
                className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                value={offer.kind}
                onChange={(event) => setOffer({ ...offer, kind: event.target.value })}
              >
                <option value="percent">Percent off</option>
                <option value="amount">Amount off</option>
                <option value="extra_trial_days">Extra trial days</option>
                <option value="extra_free_months">Extra annual months</option>
              </select>
            </label>
            <Field
              label="Percent basis points"
              value={String(offer.percentBps)}
              onChange={(value) => setOffer({ ...offer, percentBps: Number(value) })}
            />
            <Field
              label="Amount minor"
              value={String(offer.amountMinor)}
              onChange={(value) => setOffer({ ...offer, amountMinor: Number(value) })}
            />
            <label className="space-y-1 text-sm">
              <span>Amount currency</span>
              <select
                className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                value={offer.amountCurrency ?? ""}
                onChange={(event) =>
                  setOffer({ ...offer, amountCurrency: event.target.value || null })
                }
              >
                <option value="">—</option>
                <option value="GBP">GBP</option>
                <option value="USD">USD</option>
                <option value="INR">INR</option>
              </select>
            </label>
            <Field
              label="Extra trial days"
              value={String(offer.extraTrialDays)}
              onChange={(value) => setOffer({ ...offer, extraTrialDays: Number(value) })}
            />
            <Field
              label="Extra free months"
              value={String(offer.extraFreeMonths)}
              onChange={(value) => setOffer({ ...offer, extraFreeMonths: Number(value) })}
            />
            <label className="space-y-1 text-sm">
              <span>Applies to</span>
              <select
                className="flex h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                value={offer.intervals}
                onChange={(event) => setOffer({ ...offer, intervals: event.target.value })}
              >
                <option value="any">Monthly and annual</option>
                <option value="month">Monthly only</option>
                <option value="year">Annual only</option>
              </select>
            </label>
            <Field
              label="Starts"
              value={offer.startsOn ?? ""}
              onChange={(value) => setOffer({ ...offer, startsOn: value || null })}
            />
            <Field
              label="Ends"
              value={offer.endsOn ?? ""}
              onChange={(value) => setOffer({ ...offer, endsOn: value || null })}
            />
            <Field
              label="Max uses"
              value={offer.maxRedemptions == null ? "" : String(offer.maxRedemptions)}
              onChange={(value) =>
                setOffer({ ...offer, maxRedemptions: value.trim() === "" ? null : Number(value) })
              }
            />
            <label className="flex items-center gap-2 text-sm sm:col-span-3">
              <input
                type="checkbox"
                checked={offer.active}
                onChange={(event) => setOffer({ ...offer, active: event.target.checked })}
              />
              Active
            </label>
            <Button type="submit" className="sm:w-fit">
              Save offer
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function PlanEditor({
  plan,
  onSave,
}: {
  plan: BillingPlanView;
  onSave: (plan: {
    code: string;
    monthlyGbp: number;
    monthlyUsd: number;
    monthlyInr: number;
    users: number;
    invoicesPerMonth: number | null;
    billsPerMonth: number | null;
    multiCurrency: boolean;
    active: boolean;
  }) => void;
}) {
  const [gbp, setGbp] = useState(String(plan.monthlyGbp));
  const [usd, setUsd] = useState(String(plan.monthlyUsd));
  const [inr, setInr] = useState(String(plan.monthlyInr));
  const [users, setUsers] = useState(String(plan.users));
  const [invoices, setInvoices] = useState(
    plan.invoicesPerMonth == null ? "" : String(plan.invoicesPerMonth),
  );
  const [bills, setBills] = useState(plan.billsPerMonth == null ? "" : String(plan.billsPerMonth));
  const [multi, setMulti] = useState(plan.multiCurrency);
  const [active, setActive] = useState(plan.active);
  return (
    <form
      className="grid gap-2 border-t pt-3 sm:grid-cols-6"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({
          code: plan.code,
          monthlyGbp: Number(gbp),
          monthlyUsd: Number(usd),
          monthlyInr: Number(inr),
          users: Number(users),
          invoicesPerMonth: invoices.trim() === "" ? null : Number(invoices),
          billsPerMonth: bills.trim() === "" ? null : Number(bills),
          multiCurrency: multi,
          active,
        });
      }}
    >
      <p className="text-sm font-medium sm:col-span-6">{plan.name}</p>
      <Field id={`${plan.code}-gbp`} label="GBP monthly" value={gbp} onChange={setGbp} />
      <Field id={`${plan.code}-usd`} label="USD monthly" value={usd} onChange={setUsd} />
      <Field id={`${plan.code}-inr`} label="INR monthly" value={inr} onChange={setInr} />
      <Field id={`${plan.code}-users`} label="Users" value={users} onChange={setUsers} />
      <Field
        id={`${plan.code}-invoices`}
        label="Invoices / month"
        value={invoices}
        onChange={setInvoices}
      />
      <Field id={`${plan.code}-bills`} label="Bills / month" value={bills} onChange={setBills} />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={multi}
          onChange={(event) => setMulti(event.target.checked)}
        />
        Multi-currency
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={active}
          onChange={(event) => setActive(event.target.checked)}
        />
        Active
      </label>
      <Button type="submit" variant="outline" size="sm" className="sm:col-span-6 sm:w-fit">
        Save {plan.name}
      </Button>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  id,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  id?: string;
}) {
  const fieldId = id ?? label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <label className="space-y-1 text-sm" htmlFor={fieldId}>
      <span>{label}</span>
      <Input id={fieldId} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
