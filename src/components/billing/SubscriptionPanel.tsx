import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
import { cn } from "@/lib/utils";

const billingKey = (companyId: string) => ["billing-overview", companyId] as const;

type Gateway = "stripe" | "razorpay";

const GATEWAYS: { id: Gateway; title: string; detail: string }[] = [
  {
    id: "stripe",
    title: "Card",
    detail: "Visa, Mastercard and other cards. Processed by Stripe.",
  },
  {
    id: "razorpay",
    title: "Razorpay",
    detail: "UPI, cards and netbanking.",
  },
];

function paidSubscription(sub: BillingOverview["subscription"]): boolean {
  if (!sub) return false;
  if (sub.provider !== "stripe" && sub.provider !== "razorpay") return false;
  return (
    sub.status === "active" ||
    sub.status === "trialing" ||
    sub.status === "past_due" ||
    sub.status === "paused"
  );
}

function preferredGateway(
  currency: string,
  providers: BillingOverview["providers"],
): Gateway | null {
  if (currency === "INR") {
    if (providers.razorpay) return "razorpay";
    if (providers.stripe) return "stripe";
    return null;
  }
  if (providers.stripe) return "stripe";
  if (providers.razorpay) return "razorpay";
  return null;
}

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
  const [showPromo, setShowPromo] = useState(false);
  const [quotes, setQuotes] = useState<Record<string, PriceQuote>>({});
  const [target, setTarget] = useState<BillingPlanView | null>(null);
  const [intent, setIntent] = useState<"subscribe" | "switch">("subscribe");
  const [gateway, setGateway] = useState<Gateway>("stripe");
  const openedFromLink = useRef(false);
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

  useEffect(() => {
    if (openedFromLink.current || !data?.ready || !initialPlan) return;
    const plan = data.plans.find((item) => item.code === initialPlan && item.active);
    openedFromLink.current = true;
    if (!plan) return;
    const paid = paidSubscription(data.subscription);
    if (paid && data.subscription?.planCode === plan.code) return;
    setIntent(paid ? "switch" : "subscribe");
    setGateway(preferredGateway(data.currency, data.providers) ?? "stripe");
    setTarget(plan);
  }, [data, initialPlan]);

  function chooseInterval(next: BillingInterval) {
    setInterval(next);
    setQuotes({});
  }

  function openPlan(plan: BillingPlanView) {
    if (!data) return;
    const paid = paidSubscription(data.subscription);
    if (paid && data.subscription?.planCode === plan.code) return;
    setIntent(paid ? "switch" : "subscribe");
    setGateway(preferredGateway(data.currency, data.providers) ?? "stripe");
    setTarget(plan);
  }

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
    mutationFn: (input: { planCode: string; provider: Gateway; copy?: boolean }) =>
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
          () => toast.success("Payment link copied."),
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
      setTarget(null);
      toast.success(
        result.applies === "immediate"
          ? "The upgrade is active. A card subscription is prorated for the rest of this period."
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

  if (overview.isLoading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading subscription…
      </p>
    );
  }
  if (overview.isError || !data) {
    return (
      <p className="text-sm text-destructive">
        {overview.error instanceof Error
          ? overview.error.message
          : "Subscription details could not be loaded."}
      </p>
    );
  }

  const available = GATEWAYS.filter((method) => data.providers[method.id]);
  const selected = available.find((method) => method.id === gateway) ?? available[0] ?? null;
  const busy = checkout.isPending || planChange.isPending;
  const quote = target ? (quotes[target.code] ?? null) : null;
  const due = target
    ? (quote?.dueMinor ?? listAmount(target.monthlyMinor, interval, data.settings.annualFreeMonths))
    : 0;

  function continueCheckout() {
    if (!target || intent !== "subscribe" || !selected) return;
    checkout.mutate({ planCode: target.code, provider: selected.id });
  }

  return (
    <div className="space-y-8">
      <AccountSummary
        data={data}
        portalPending={portal.isPending}
        onPortal={() => portal.mutate()}
      />

      <div className="flex flex-col items-center gap-3">
        <div
          className="inline-flex rounded-full border bg-muted/40 p-1"
          role="group"
          aria-label="Billing period"
        >
          <Button
            type="button"
            size="sm"
            className="rounded-full"
            variant={interval === "month" ? "default" : "ghost"}
            onClick={() => chooseInterval("month")}
          >
            Monthly
          </Button>
          <Button
            type="button"
            size="sm"
            className="rounded-full"
            variant={interval === "year" ? "default" : "ghost"}
            onClick={() => chooseInterval("year")}
          >
            Yearly
            {data.settings.annualFreeMonths > 0 ? " · 2 months free" : ""}
          </Button>
        </div>
        {showPromo ? (
          <form
            className="flex flex-wrap items-end justify-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void applyCode();
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="promo-code" className="sr-only">
                Promo code
              </Label>
              <Input
                id="promo-code"
                value={offerCode}
                onChange={(event) => setOfferCode(event.target.value.toUpperCase())}
                placeholder="Promo code"
                className="w-40"
                autoComplete="off"
              />
            </div>
            <Button type="submit" variant="outline" size="sm">
              Apply
            </Button>
          </form>
        ) : (
          <button
            type="button"
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            onClick={() => setShowPromo(true)}
          >
            {appliedCode ? `Promo ${appliedCode} applied` : "Add promo code"}
          </button>
        )}
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
              busy={busy}
              onChoose={() => openPlan(plan)}
            />
          ))}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Prices are per organisation and exclude local tax. Yearly billing is ten times the monthly
        price. A new organisation starts a {data.settings.trialDays}-day{" "}
        {data.settings.trialPlanCode.replace(/^./, (letter) => letter.toUpperCase())} trial with no
        card. The ledger is the same on every plan.
      </p>

      <Dialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          {target ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {intent === "switch" ? `Switch to ${target.name}` : `Subscribe to ${target.name}`}
                </DialogTitle>
                <DialogDescription>
                  {intent === "switch"
                    ? "An upgrade applies now. A downgrade starts when the current period ends. Card subscriptions are prorated. Records already posted stay available."
                    : "You continue on a secure payment page. Nothing is charged until you confirm there."}
                </DialogDescription>
              </DialogHeader>

              <dl className="space-y-2 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Plan</dt>
                  <dd className="font-medium">{target.name}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Billing</dt>
                  <dd className="font-medium">{interval === "year" ? "Yearly" : "Monthly"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">
                    {intent === "switch" ? "Price" : "Due at checkout"}
                  </dt>
                  <dd className="font-medium">{formatMinor(due, data.currency)}</dd>
                </div>
                {quote && quote.discountMinor > 0 ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Promo {quote.offerCode}</dt>
                    <dd>List {formatMinor(quote.listMinor, data.currency)}</dd>
                  </div>
                ) : null}
              </dl>

              {intent === "subscribe" ? (
                <PaymentChoices
                  methods={available}
                  gateway={selected?.id ?? gateway}
                  recommended={preferredGateway(data.currency, data.providers)}
                  onChange={setGateway}
                />
              ) : null}

              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setTarget(null)}
                >
                  Cancel
                </Button>
                {intent === "subscribe" && selected ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      checkout.mutate({ planCode: target.code, provider: selected.id, copy: true })
                    }
                  >
                    Copy link
                  </Button>
                ) : null}
                {intent === "switch" ? (
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() => planChange.mutate(target.code)}
                  >
                    {planChange.isPending ? "Updating…" : "Confirm switch"}
                  </Button>
                ) : (
                  <Button type="button" disabled={busy || !selected} onClick={continueCheckout}>
                    {checkout.isPending ? "Opening checkout…" : "Continue to payment"}
                  </Button>
                )}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AccountSummary({
  data,
  portalPending,
  onPortal,
}: {
  data: BillingOverview;
  portalPending: boolean;
  onPortal: () => void;
}) {
  const sub = data.subscription;
  const renewal =
    sub?.trialEndsAt && sub.status === "trialing"
      ? `Trial ends ${new Date(sub.trialEndsAt).toLocaleDateString()}`
      : sub?.currentPeriodEnd
        ? `Renews ${new Date(sub.currentPeriodEnd).toLocaleDateString()}`
        : null;
  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold">{data.companyName}</h2>
          <Badge variant={sub?.status === "active" ? "success" : "secondary"}>
            {sub ? statusLabel(sub.status) : "No subscription"}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {sub ? (
            <>
              {sub.planName}
              {renewal ? ` · ${renewal}` : ""}
              {sub.cancelAtPeriodEnd ? " · Cancels at period end" : ""}
            </>
          ) : (
            "Choose a plan below to subscribe."
          )}
        </p>
        <p className="text-sm text-muted-foreground">
          {data.usage.invoicesThisMonth}{" "}
          {data.usage.invoicesThisMonth === 1 ? "invoice" : "invoices"}, {data.usage.billsThisMonth}{" "}
          {data.usage.billsThisMonth === 1 ? "bill" : "bills"}, {data.usage.users}{" "}
          {data.usage.users === 1 ? "user" : "users"} this month. Prices in {data.currency}.
        </p>
        {data.message ? <p className="text-sm">{data.message}</p> : null}
        {data.access === "read_only" ? (
          <p className="text-sm">Reports stay available. Subscribe to post again.</p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {sub?.provider === "stripe" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={portalPending}
            onClick={onPortal}
          >
            Manage billing
          </Button>
        ) : null}
        {data.isOperator ? (
          <Button type="button" variant="ghost" size="sm" asChild>
            <Link to="/platform/billing">Platform billing</Link>
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function PlanCard({
  plan,
  overview,
  interval,
  quote,
  busy,
  onChoose,
}: {
  plan: BillingPlanView;
  overview: BillingOverview;
  interval: BillingInterval;
  quote: PriceQuote | null;
  busy: boolean;
  onChoose: () => void;
}) {
  const current = overview.subscription?.planCode === plan.code;
  const paidHere = current && paidSubscription(overview.subscription);
  const recommended = plan.code === "growth" && !current;
  const list = listAmount(plan.monthlyMinor, interval, overview.settings.annualFreeMonths);
  const due = quote?.dueMinor ?? list;
  return (
    <article
      className={cn(
        "flex h-full flex-col rounded-xl border bg-card p-5",
        recommended && "border-primary shadow-sm",
        paidHere && "ring-1 ring-primary",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold tracking-tight">{plan.name}</h3>
          <p className="text-xs text-muted-foreground">{plan.audience}</p>
        </div>
        {current ? <Badge>Current</Badge> : null}
        {recommended ? <Badge variant="info">Most popular</Badge> : null}
      </div>
      <p className="mt-5">
        <span className="text-3xl font-semibold tracking-tight">
          {formatMinor(due, overview.currency)}
        </span>
        <span className="text-sm text-muted-foreground">
          {" "}
          / {interval === "year" ? "year" : "month"}
        </span>
      </p>
      {quote && quote.discountMinor > 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">
          List {formatMinor(quote.listMinor, overview.currency)} with {quote.offerCode}
        </p>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">
          {interval === "year" ? "Billed once a year" : "Billed monthly"}
        </p>
      )}
      <Button
        type="button"
        className="mt-4 w-full"
        variant={recommended ? "default" : "outline"}
        disabled={busy || paidHere}
        onClick={onChoose}
      >
        {paidHere
          ? "Current plan"
          : paidSubscription(overview.subscription)
            ? "Switch plan"
            : "Subscribe"}
      </Button>
      <p className="mt-4 text-sm">{plan.summary}</p>
      <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
        {plan.highlights.map((line) => (
          <li key={line} className="flex gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function PaymentChoices({
  methods,
  gateway,
  recommended,
  onChange,
}: {
  methods: { id: Gateway; title: string; detail: string }[];
  gateway: Gateway;
  recommended: Gateway | null;
  onChange: (gateway: Gateway) => void;
}) {
  if (methods.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
        Online checkout is not turned on for this server yet. The trial and the ledger keep working.
        An administrator adds the payment keys, then Continue to payment opens a real checkout.
      </p>
    );
  }
  if (methods.length === 1) {
    const only = methods[0];
    if (!only) return null;
    return (
      <p className="text-sm text-muted-foreground">
        Payment is taken by {only.id === "stripe" ? "Stripe" : "Razorpay"}. {only.detail}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Payment method</p>
      <RadioGroup
        value={gateway}
        onValueChange={(value) => {
          if (value === "stripe" || value === "razorpay") onChange(value);
        }}
        className="gap-2"
        aria-label="Payment method"
      >
        {methods.map((method) => {
          const selected = gateway === method.id;
          return (
            <label
              key={method.id}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3",
                selected && "border-primary bg-primary/5",
              )}
            >
              <RadioGroupItem value={method.id} className="mt-0.5" />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-medium">
                  {method.title}
                  {recommended === method.id ? (
                    <span className="text-xs font-normal text-muted-foreground">Recommended</span>
                  ) : null}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{method.detail}</span>
              </span>
            </label>
          );
        })}
      </RadioGroup>
    </div>
  );
}

function statusLabel(status: string): string {
  if (status === "trialing") return "Trial";
  if (status === "active") return "Active";
  if (status === "past_due") return "Payment due";
  if (status === "complimentary") return "Complimentary";
  if (status === "cancelled") return "Cancelled";
  if (status === "expired") return "Ended";
  if (status === "paused") return "Paused";
  return status;
}
