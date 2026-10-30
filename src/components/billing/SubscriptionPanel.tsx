import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createBillingCheckout,
  getBillingOverview,
  previewBillingQuote,
  type BillingOverview,
  type BillingPlanView,
} from "@/lib/billing/billing.functions";
import {
  changeOrganisationPlan,
  openBillingPortal,
} from "@/lib/billing/subscription-actions.functions";
import {
  formatMinor,
  listAmount,
  type BillingInterval,
  type PriceQuote,
} from "@/lib/billing/pricing";

const billingKey = (companyId: string) => ["billing-overview", companyId] as const;

export function SubscriptionPanel({
  companyId,
  initialPlan,
  initialInterval,
}: {
  companyId: string;
  initialPlan?: string;
  initialInterval?: BillingInterval;
}) {
  const fetchOverview = useServerFn(getBillingOverview);
  const preview = useServerFn(previewBillingQuote);
  const startCheckout = useServerFn(createBillingCheckout);
  const changePlan = useServerFn(changeOrganisationPlan);
  const openPortal = useServerFn(openBillingPortal);
  const overview = useQuery({
    queryKey: billingKey(companyId),
    queryFn: () => fetchOverview({ data: { companyId } }),
  });
  const [interval, setInterval] = useState<BillingInterval>(initialInterval ?? "month");
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
    mutationFn: (input: { planCode: string; provider: "stripe" | "razorpay"; copy?: boolean }) =>
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
    onSuccess: (result, input) => {
      if (input.copy) {
        void navigator.clipboard.writeText(result.url).then(
          () => toast.success("Payment link copied. Send it to the person who will pay."),
          () => toast.message(result.url),
        );
        return;
      }
      window.location.assign(result.url);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Checkout could not be started.");
    },
  });
  const planChange = useMutation({
    mutationFn: (planCode: string) => changePlan({ data: { companyId, planCode, interval } }),
    onSuccess: (result) => {
      toast.success(
        result.applies === "immediate"
          ? "The upgrade is active. Stripe prorates the current period when a card subscription exists."
          : "The downgrade starts at the end of the current period. Existing records stay available.",
      );
      void overview.refetch();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "The plan could not be changed.");
    },
  });
  const portal = useMutation({
    mutationFn: () => openPortal({ data: { companyId, origin: window.location.origin } }),
    onSuccess: (result) => {
      window.location.assign(result.url);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "The payment portal could not be opened.",
      );
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
      {initialPlan ? (
        <p className="text-sm">
          Continue to pay for {initialPlan}. Pay with card opens Stripe. Pay with Razorpay opens the
          India checkout. Copy card payment link gives a link you can send.
        </p>
      ) : null}
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
              busy={checkout.isPending || planChange.isPending}
              onCheckout={(provider) => checkout.mutate({ planCode: plan.code, provider })}
              onCopyLink={(provider) =>
                checkout.mutate({ planCode: plan.code, provider, copy: true })
              }
              {...(data.subscription && !data.isDemo
                ? { onChangePlan: () => planChange.mutate(plan.code) }
                : {})}
            />
          ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Prices are per organisation and exclude local tax. List prices are Starter $12, Growth $30,
        Pro $60 and Practice $99 a month. Annual billing is ten times the monthly price. A new
        organisation starts a {data.settings.trialDays}-day {data.settings.trialPlanCode} trial with
        no card. The posting engine is the same on every plan.
      </p>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Plan changes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            Organisation owners choose a plan here. Price, feature and promo changes are made in the
            platform billing console, which is limited to platform staff.
          </p>
          {data.subscription?.provider === "stripe" ? (
            <Button
              type="button"
              variant="outline"
              disabled={portal.isPending}
              onClick={() => portal.mutate()}
            >
              Payment method and invoices
            </Button>
          ) : null}
          {data.isOperator ? (
            <Button type="button" variant="outline" asChild>
              <Link to="/platform/billing">Open platform billing</Link>
            </Button>
          ) : null}
          {data.usage ? (
            <p className="text-muted-foreground">
              This month: {data.usage.invoicesThisMonth} invoices, {data.usage.billsThisMonth}{" "}
              bills, {data.usage.users} users. You can still open and export existing records when a
              limit is reached.
            </p>
          ) : null}
        </CardContent>
      </Card>
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
  onCopyLink,
  onChangePlan,
}: {
  plan: BillingPlanView;
  overview: BillingOverview;
  interval: BillingInterval;
  quote: PriceQuote | null;
  current: boolean;
  busy: boolean;
  onCheckout: (provider: "stripe" | "razorpay") => void;
  onCopyLink: (provider: "stripe" | "razorpay") => void;
  onChangePlan?: () => void;
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
        <div className="flex flex-col gap-2">
          <Button type="button" disabled={busy} onClick={() => onCheckout("stripe")}>
            Pay with card
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onCheckout("razorpay")}
          >
            Pay with Razorpay
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => onCopyLink("stripe")}
          >
            Copy card payment link
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => onCopyLink("razorpay")}
          >
            Copy Razorpay payment link
          </Button>
        </div>
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
        {onChangePlan && !current ? (
          <Button type="button" variant="outline" disabled={busy} onClick={onChangePlan}>
            Change to this plan
          </Button>
        ) : null}
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
