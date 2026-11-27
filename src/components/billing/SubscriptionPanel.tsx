import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Check, Info, Loader2 } from "lucide-react";
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
import { CheckoutForm } from "@/components/billing/CheckoutForm";
import { BillingDocuments } from "@/components/billing/BillingDocuments";
import { ReferralPanel } from "@/components/billing/ReferralPanel";
import { SubscriptionLifecycle } from "@/components/billing/SubscriptionLifecycle";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  confirmBillingCheckout,
  createBillingCheckout,
  getBillingOverview,
  previewBillingQuote,
  type BillingOverview,
  type BillingPlanView,
} from "@/lib/billing/billing.functions";
import type { CheckoutBillingInput, PayMethodId } from "@/lib/billing/checkout-payload";
import {
  changeOrganisationPlan,
  openBillingPortal,
  previewOrganisationPlanChange,
  reverseScheduledPlanChange,
  syncOrganisationSubscription,
  type PlanChangePreview,
} from "@/lib/billing/subscription-actions.functions";
import {
  formatMinor,
  isBillingCurrency,
  listAmount,
  planByCode,
  type BillingCurrency,
  type BillingInterval,
  type PriceQuote,
} from "@/lib/billing/pricing";
import { formatMinorAmount } from "@/lib/billing/domain/money";
import { billingChargeRules, planChangePaymentCopy } from "@/lib/billing/domain/billing-policy";
import { lockedSubscriptionProvider } from "@/lib/billing/provider-resolution";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { cn } from "@/lib/utils";

const billingKey = (companyId: string) => ["billing-overview", companyId] as const;

function visiblePlans(data: BillingOverview): BillingPlanView[] {
  return data.plans
    .filter((plan) => plan.active && (plan.isPublic || plan.code === data.subscription?.planCode))
    .sort((a, b) => a.rank - b.rank);
}

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

function paymentProviderReady(data: BillingOverview): boolean {
  const routed = data.routedProviders?.length
    ? data.routedProviders
    : data.countryCode === "IN"
      ? (["razorpay"] as const)
      : (["stripe"] as const);
  return routed.some((provider) => data.providers[provider]);
}

function PaymentSetupCallout({ data, plans }: { data: BillingOverview; plans: BillingPlanView[] }) {
  const hasCatalogPrices = plans.some(
    (plan) => plan.pricePublished || plan.listPrice?.monthlyMinor != null,
  );
  if (!hasCatalogPrices || paymentProviderReady(data)) return null;
  if (data.subscription && paidSubscription(data.subscription)) return null;

  const routed = data.routedProviders?.length
    ? data.routedProviders
    : data.countryCode === "IN"
      ? (["razorpay"] as const)
      : (["stripe"] as const);
  const provider = routed.find((item) => !data.providers[item]) ?? routed[0] ?? "stripe";
  const providerLabel = provider === "stripe" ? "Stripe" : "Razorpay";

  return (
    <Alert variant="info" className="max-w-3xl mx-auto">
      <Info className="size-4" aria-hidden />
      <AlertTitle>{providerLabel} is not connected on this server</AlertTitle>
      <AlertDescription className="space-y-2">
        <p>
          Plan prices are published for {data.countryCode}. Subscribe needs {providerLabel} API keys
          in server environment variables — not products you create in the {providerLabel}{" "}
          dashboard.
        </p>
        <p className="text-muted-foreground">
          You can ignore Stripe&apos;s setup guide steps such as &quot;Create a recurring
          product&quot; or customer portal; StreakBooks creates provider prices on first checkout.
        </p>
        <p className="text-muted-foreground">
          Server env required:{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            {provider === "stripe"
              ? "STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET"
              : "RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET + RAZORPAY_WEBHOOK_SECRET + RAZORPAY_MODE=test"}
          </code>
          {import.meta.env.DEV ? (
            <>
              {" "}
              in <code className="rounded bg-muted px-1 py-0.5 text-xs">.env.local</code>. On
              Vercel, set the same names for Preview and Production (Test Mode keys only for
              staging).
            </>
          ) : (
            <> on the Vercel project (Preview / Production), then redeploy.</>
          )}
        </p>
      </AlertDescription>
    </Alert>
  );
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
  const confirmCheckout = useServerFn(confirmBillingCheckout);
  const preview = useServerFn(previewBillingQuote);
  const startCheckout = useServerFn(createBillingCheckout);
  const changePlan = useServerFn(changeOrganisationPlan);
  const previewPlanChange = useServerFn(previewOrganisationPlanChange);
  const reversePlanChange = useServerFn(reverseScheduledPlanChange);
  const openPortal = useServerFn(openBillingPortal);
  const syncSubscription = useServerFn(syncOrganisationSubscription);
  const [activating, setActivating] = useState(false);
  const [planSwitchPending, setPlanSwitchPending] = useState<string | null>(null);
  const overview = useQuery({
    queryKey: billingKey(companyId),
    queryFn: () => fetchOverview({ data: { companyId } }),
    refetchInterval: activating || planSwitchPending ? 2_500 : false,
  });
  const [interval, setInterval] = useState<BillingInterval>(initialInterval ?? "month");
  const [offerCode, setOfferCode] = useState("");
  const [appliedCode, setAppliedCode] = useState("");
  const [showPromo, setShowPromo] = useState(false);
  const [quotes, setQuotes] = useState<Record<string, PriceQuote>>({});
  const [target, setTarget] = useState<BillingPlanView | null>(null);
  const [intent, setIntent] = useState<"subscribe" | "switch">("subscribe");
  const [switchPreview, setSwitchPreview] = useState<PlanChangePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const openedFromLink = useRef(false);
  const handledCheckoutReturn = useRef(false);
  const handledPlanChangeReturn = useRef(false);
  const data = overview.data;
  const checkoutQuote = useQuery({
    queryKey: [
      "billing-region-quote",
      companyId,
      target?.code,
      interval,
      appliedCode,
      data?.countryCode,
    ],
    enabled: Boolean(target && intent === "subscribe" && data?.ready),
    queryFn: () =>
      preview({
        data: {
          companyId,
          planCode: target!.code,
          interval,
          offerCode: appliedCode,
        },
      }),
    retry: false,
  });

  useEffect(() => {
    if (handledCheckoutReturn.current) return;
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    if (!checkout) return;
    handledCheckoutReturn.current = true;
    const sessionId = params.get("session_id");
    const cleanReturnUrl = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete("checkout");
      url.searchParams.delete("session_id");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    };
    if (checkout === "cancel") {
      cleanReturnUrl();
      toast.message("Checkout was cancelled. No charge was made.");
      return;
    }
    if (checkout !== "success") return;
    const finish = (message: string, variant: "success" | "message" = "success") => {
      cleanReturnUrl();
      setActivating(false);
      if (variant === "success") toast.success(message);
      else toast.message(message);
      void overview.refetch();
    };
    if (!sessionId) {
      setActivating(true);
      toast.message("Payment received. Activating your subscription…");
      window.setTimeout(() => {
        void overview.refetch().then(() => setActivating(false));
      }, 8_000);
      cleanReturnUrl();
      return;
    }
    setActivating(true);
    void (async () => {
      try {
        const result = await confirmCheckout({ data: { companyId, sessionId } });
        if (result.status === "applied") {
          finish("Subscription is active. Thank you for subscribing.");
        } else if (result.status === "already_active") {
          finish("Your subscription is already active.");
        } else if (result.status === "pending") {
          cleanReturnUrl();
          toast.message(`${result.reason} We will keep checking for a moment.`);
          window.setTimeout(() => {
            void overview.refetch().then(() => setActivating(false));
          }, 12_000);
        } else {
          finish(result.reason, "message");
        }
      } catch (error) {
        cleanReturnUrl();
        setActivating(false);
        toast.error(friendlyAuthError(error));
        void overview.refetch();
      }
    })();
  }, [companyId, confirmCheckout, overview]);

  useEffect(() => {
    if (handledPlanChangeReturn.current) return;
    const params = new URLSearchParams(window.location.search);
    const planChangeResult = params.get("plan_change");
    if (!planChangeResult) return;
    handledPlanChangeReturn.current = true;
    const cleanReturnUrl = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete("plan_change");
      url.searchParams.delete("session_id");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    };
    if (planChangeResult === "cancel") {
      cleanReturnUrl();
      toast.message("Plan change payment was cancelled.");
      return;
    }
    if (planChangeResult !== "success") return;
    cleanReturnUrl();
    setPlanSwitchPending(null);
    setActivating(true);
    toast.success("Payment received. Updating your plan…");
    void (async () => {
      try {
        await syncSubscription({ data: { companyId } });
        await overview.refetch();
      } catch (error) {
        toast.error(friendlyAuthError(error));
      } finally {
        setActivating(false);
      }
    })();
  }, [companyId, overview, syncSubscription]);

  useEffect(() => {
    if (!activating || !data?.subscription) return;
    if (paidSubscription(data.subscription)) setActivating(false);
  }, [activating, data?.subscription]);

  useEffect(() => {
    if (!planSwitchPending || !data?.subscription) return;
    if (data.subscription.planCode === planSwitchPending) {
      setPlanSwitchPending(null);
      return;
    }
    const timer = window.setInterval(() => {
      void syncSubscription({ data: { companyId } }).then(() => overview.refetch());
    }, 4_000);
    const stop = window.setTimeout(() => setPlanSwitchPending(null), 45_000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stop);
    };
  }, [planSwitchPending, data?.subscription, companyId, syncSubscription, overview]);

  // Hosted invoice pages often do not redirect back — sync when the user returns after an upgrade.
  useEffect(() => {
    if (!planSwitchPending) return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void syncSubscription({ data: { companyId } })
        .then(() => overview.refetch())
        .catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [companyId, overview, planSwitchPending, syncSubscription]);

  useEffect(() => {
    if (openedFromLink.current || !data?.ready || !initialPlan) return;
    const plan = visiblePlans(data).find((item) => item.code === initialPlan);
    openedFromLink.current = true;
    if (!plan?.checkoutReady) return;
    const paid = paidSubscription(data.subscription);
    if (paid && data.subscription?.planCode === plan.code) return;
    setIntent(paid ? "switch" : "subscribe");
    setTarget(plan);
  }, [data, initialPlan]);

  function chooseInterval(next: BillingInterval) {
    setInterval(next);
    setQuotes({});
  }

  function openPlan(plan: BillingPlanView) {
    if (!data || !plan.checkoutReady) return;
    const paid = paidSubscription(data.subscription);
    const samePlanSameInterval =
      paid && data.subscription?.planCode === plan.code && data.subscription.interval === interval;
    if (samePlanSameInterval) return;
    setIntent(paid ? "switch" : "subscribe");
    setTarget(plan);
    setSwitchPreview(null);
    setPreviewError(null);
  }

  useEffect(() => {
    if (!target || intent !== "switch" || !data?.ready) return;
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewError(null);
    void previewPlanChange({
      data: {
        companyId,
        planCode: target.code,
        interval,
        origin: window.location.origin,
      },
    })
      .then((preview) => {
        if (!cancelled) setSwitchPreview(preview);
      })
      .catch((error) => {
        if (!cancelled) {
          setSwitchPreview(null);
          setPreviewError(friendlyAuthError(error));
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [target, intent, interval, companyId, data?.ready, previewPlanChange]);

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
    const targets = visiblePlans(data).filter((plan) => plan.checkoutReady);
    if (targets.length === 0) {
      toast.error("Promo codes can be used once plan prices are published.");
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
      toast.error(friendlyAuthError(error));
    }
  }

  const checkout = useMutation({
    mutationFn: (input: {
      planCode: string;
      method: PayMethodId;
      billing: CheckoutBillingInput;
      copy?: boolean;
    }) =>
      startCheckout({
        data: {
          companyId,
          planCode: input.planCode,
          interval,
          method: input.method,
          origin: window.location.origin,
          offerCode: appliedCode,
          billing: input.billing,
        },
      }),
    onSuccess: (result, input) => {
      if (!result.url) {
        toast.error("Checkout did not return a payment page.");
        return;
      }
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
      toast.error(friendlyAuthError(error));
    },
  });
  const planChange = useMutation({
    mutationFn: (planCode: string) =>
      changePlan({
        data: { companyId, planCode, interval, origin: window.location.origin },
      }),
    onSuccess: (result) => {
      if (result.paymentActionUrl && result.provider === "stripe") {
        setTarget(null);
        setPlanSwitchPending(result.targetPlanCode);
        toast.message("Opening Stripe to pay the prorated upgrade…");
        window.location.assign(result.paymentActionUrl);
        return;
      }
      setTarget(null);
      if (result.applies === "period_end") {
        toast.success(
          `${result.kind === "upgrade" ? "Upgrade" : "Downgrade"} scheduled. You keep your current plan until${
            result.effectiveAt
              ? ` ${new Date(result.effectiveAt).toLocaleDateString()}`
              : " renewal"
          }.`,
        );
      } else if (result.kind === "upgrade") {
        setPlanSwitchPending(result.targetPlanCode);
        toast.success(
          result.chargedOnFile
            ? "Upgrade charged to your card on file. Updating your plan…"
            : result.alreadyApplied
              ? "Your plan is already upgraded."
              : "Upgrade complete. Refreshing your subscription…",
        );
      } else {
        toast.success(
          `Downgrade scheduled. You keep your current plan until${
            result.effectiveAt
              ? ` ${new Date(result.effectiveAt).toLocaleDateString()}`
              : " renewal"
          }.`,
        );
      }
      void overview.refetch();
    },
    onError: (error) => {
      toast.error(friendlyAuthError(error));
    },
  });
  const reverseScheduled = useMutation({
    mutationFn: () => reversePlanChange({ data: { companyId } }),
    onSuccess: (result) => {
      if (!result.reversed) {
        toast.message(result.reason ?? "Nothing to reverse.");
        return;
      }
      toast.success("Scheduled plan change cancelled. You keep your current plan.");
      void overview.refetch();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const portal = useMutation({
    mutationFn: () => openPortal({ data: { companyId, origin: window.location.origin } }),
    onSuccess: (result) => {
      window.location.assign(result.url);
    },
    onError: (error) => {
      toast.error(friendlyAuthError(error));
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
  if (overview.isError) {
    return <QueryErrorState queries={[overview]} title="Could not load subscription details" />;
  }
  if (!data) return null;

  const busy = checkout.isPending || planChange.isPending || activating;
  const quote = target ? (quotes[target.code] ?? null) : null;
  const due =
    target && target.monthlyMinor !== null
      ? (quote?.dueMinor ??
        listAmount(target.monthlyMinor, interval, data.settings.annualFreeMonths))
      : (target?.listPrice?.monthlyMinor ?? 0);
  const listCurrency =
    target?.listPrice && isBillingCurrency(target.listPrice.currency)
      ? target.listPrice.currency
      : null;
  // Region / subscription currency wins; never show GBP for an INR subscription.
  const dueCurrency =
    switchPreview && isBillingCurrency(switchPreview.currency)
      ? switchPreview.currency
      : listCurrency === data.currency
        ? listCurrency
        : data.currency;
  const checkingOut = target != null && intent === "subscribe";
  const currentPlan = data.subscription
    ? visiblePlans(data).find((plan) => plan.code === data.subscription?.planCode)
    : null;
  const currentMonthly = currentPlan?.listPrice?.monthlyMinor ?? currentPlan?.monthlyMinor ?? 0;
  const targetMonthly = target?.listPrice?.monthlyMinor ?? target?.monthlyMinor ?? 0;
  const isUpgradeSwitch = Boolean(
    switchPreview?.kind === "upgrade" ||
    (target && intent === "switch" && targetMonthly > currentMonthly),
  );
  const lockedProvider =
    lockedSubscriptionProvider(switchPreview?.provider) ??
    lockedSubscriptionProvider(data.subscription?.provider);
  const switchCopy = planChangePaymentCopy(
    isUpgradeSwitch ? "upgrade" : "downgrade",
    lockedProvider ?? "stripe",
  );
  const chargeRules = billingChargeRules(lockedProvider);
  const scheduledPlanName = data.subscription?.scheduledPlanCode
    ? (data.plans.find((plan) => plan.code === data.subscription?.scheduledPlanCode)?.name ??
      data.subscription.scheduledPlanCode)
    : null;

  return (
    <div className="space-y-8">
      {activating ? (
        <Alert>
          <Loader2 className="size-4 animate-spin" aria-hidden />
          <AlertTitle>Activating your subscription</AlertTitle>
          <AlertDescription>
            Payment succeeded. We are confirming it with your payment provider and updating your
            plan — this usually takes a few seconds.
          </AlertDescription>
        </Alert>
      ) : null}
      {planSwitchPending && data.subscription?.planCode !== planSwitchPending ? (
        <Alert variant="default" className="border-dashed">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          <AlertTitle>Upgrade in progress</AlertTitle>
          <AlertDescription className="text-sm">
            {lockedProvider === "razorpay" ? (
              <>
                Plan change for{" "}
                <strong>
                  {visiblePlans(data).find((p) => p.code === planSwitchPending)?.name ??
                    planSwitchPending}
                </strong>{" "}
                is waiting for Razorpay confirmation. This page updates when the webhook arrives.
              </>
            ) : (
              <>
                Finish payment on Stripe for{" "}
                <strong>
                  {visiblePlans(data).find((p) => p.code === planSwitchPending)?.name ??
                    planSwitchPending}
                </strong>
                . This page updates automatically when Stripe confirms the charge.
              </>
            )}
          </AlertDescription>
        </Alert>
      ) : null}
      <AccountSummary
        data={data}
        portalPending={portal.isPending}
        reversePending={reverseScheduled.isPending}
        scheduledPlanName={scheduledPlanName}
        onPortal={() => portal.mutate()}
        onReverseScheduled={() => reverseScheduled.mutate()}
      />
      {data.subscription?.status === "past_due" ? (
        <Alert variant="destructive" className="max-w-3xl">
          <Info className="size-4" aria-hidden />
          <AlertTitle>Payment failed</AlertTitle>
          <AlertDescription className="space-y-2 text-sm">
            <p>
              Your last renewal could not be collected. Access continues during the grace period.
              {lockedProvider === "razorpay"
                ? " Update the UPI mandate or payment method in Razorpay to avoid interruption."
                : " Update the card to avoid interruption."}
            </p>
            {lockedProvider === "stripe" ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={portal.isPending}
                onClick={() => portal.mutate()}
              >
                Update payment method
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      {data.ready && paidSubscription(data.subscription) ? (
        <Alert variant="default" className="max-w-3xl border-dashed bg-muted/30">
          <Info className="size-4" aria-hidden />
          <AlertTitle>
            {lockedProvider === "razorpay"
              ? "When Razorpay charges"
              : lockedProvider === "stripe"
                ? "When Stripe charges"
                : "When billing charges"}
          </AlertTitle>
          <AlertDescription className="text-sm leading-relaxed">
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {chargeRules.map((rule) => (
                <li key={rule.title}>
                  <strong>{rule.title}</strong>: {rule.body}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
      {data.ready && !data.isDemo ? <SubscriptionLifecycle companyId={companyId} /> : null}
      {data.ready && !data.isDemo ? <BillingDocuments companyId={companyId} /> : null}
      {data.ready && !data.isDemo ? <ReferralPanel companyId={companyId} /> : null}

      {checkout.isPending || planChange.isPending ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
          role="status"
          aria-live="polite"
          aria-label="Redirecting to secure checkout"
        >
          <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-8 py-6 shadow-lg">
            <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
            <p className="text-sm font-medium">
              {planChange.isPending
                ? lockedProvider === "razorpay"
                  ? "Scheduling plan change…"
                  : "Opening Stripe payment…"
                : "Redirecting to secure checkout…"}
            </p>
            <p className="max-w-xs text-center text-xs text-muted-foreground">
              Do not close this window. You will return to StreakBooks when payment is complete.
            </p>
          </div>
        </div>
      ) : null}

      {checkingOut && target ? (
        <CheckoutForm
          planName={target.name}
          interval={interval}
          monthly={monthlyPrices(target)}
          annualFreeMonths={data.settings.annualFreeMonths}
          companyName={data.companyName}
          defaultCountry={data.countryCode}
          busy={checkout.isPending}
          serverError={checkout.isError ? friendlyAuthError(checkout.error) : null}
          providers={data.providers}
          routedProviders={data.routedProviders}
          quote={checkoutQuote.data ?? null}
          quoteLoading={checkoutQuote.isFetching}
          quoteError={checkoutQuote.isError ? friendlyAuthError(checkoutQuote.error) : null}
          priceCurrency={dueCurrency}
          onBack={() => setTarget(null)}
          onPay={(billing, method, copy) =>
            checkout.mutate({ planCode: target.code, method, billing, copy })
          }
        />
      ) : (
        <PlanPicker
          data={data}
          interval={interval}
          quotes={quotes}
          appliedCode={appliedCode}
          showPromo={showPromo}
          offerCode={offerCode}
          busy={busy}
          onInterval={chooseInterval}
          onOfferCode={setOfferCode}
          onShowPromo={() => setShowPromo(true)}
          onApply={() => void applyCode()}
          onChoose={openPlan}
        />
      )}

      <Dialog
        open={target !== null && intent === "switch"}
        onOpenChange={(open) => {
          if (!open && !busy) setTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          {target ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {switchCopy.titleVerb} to {target.name}
                </DialogTitle>
                <DialogDescription>{switchCopy.description}</DialogDescription>
              </DialogHeader>
              <dl className="space-y-2 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">From</dt>
                  <dd className="font-medium">
                    {currentPlan?.name ?? data.subscription?.planName ?? "—"}
                    {data.subscription?.interval
                      ? ` · ${data.subscription.interval === "year" ? "Yearly" : "Monthly"}`
                      : ""}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">To</dt>
                  <dd className="font-medium">
                    {target.name} · {interval === "year" ? "Yearly" : "Monthly"}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">List price</dt>
                  <dd className="font-medium">
                    {switchPreview
                      ? formatMinor(
                          switchPreview.listAmountMinor,
                          isBillingCurrency(switchPreview.currency)
                            ? switchPreview.currency
                            : dueCurrency,
                        )
                      : formatMinor(due, dueCurrency)}
                  </dd>
                </div>
                {previewLoading ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    Calculating prorated amount…
                  </div>
                ) : null}
                {previewError ? (
                  <p role="alert" className="text-destructive-ink">
                    {previewError}
                  </p>
                ) : null}
                {switchPreview && !previewLoading ? (
                  <>
                    {switchPreview.lines.slice(0, 4).map((line) => (
                      <div
                        key={`${line.description}-${line.amountMinor}`}
                        className="flex justify-between gap-4"
                      >
                        <dt className="text-muted-foreground">{line.description}</dt>
                        <dd>
                          {formatMinor(
                            line.amountMinor,
                            isBillingCurrency(switchPreview.currency)
                              ? switchPreview.currency
                              : dueCurrency,
                          )}
                        </dd>
                      </div>
                    ))}
                    <div className="flex justify-between gap-4 border-t pt-2 font-medium">
                      <dt>Due now</dt>
                      <dd>
                        {switchPreview.paymentRequired
                          ? formatMinor(
                              switchPreview.amountDueMinor,
                              isBillingCurrency(switchPreview.currency)
                                ? switchPreview.currency
                                : dueCurrency,
                            )
                          : `${formatMinor(0, dueCurrency)} — no charge today`}
                      </dd>
                    </div>
                  </>
                ) : null}
                <div className="flex justify-between gap-4 border-t pt-2">
                  <dt className="text-muted-foreground">Payment now</dt>
                  <dd className="font-medium">
                    {switchPreview
                      ? switchPreview.paymentRequired
                        ? lockedProvider === "razorpay"
                          ? "No charge today"
                          : "Yes — open Stripe"
                        : "No charge today"
                      : switchCopy.paymentNow}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">New plan starts</dt>
                  <dd className="font-medium">
                    {switchPreview?.effectiveAt
                      ? new Date(switchPreview.effectiveAt).toLocaleDateString()
                      : switchCopy.whenStarts}
                  </dd>
                </div>
              </dl>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setTarget(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={busy || previewLoading || Boolean(previewError)}
                  onClick={() => planChange.mutate(target.code)}
                >
                  {planChange.isPending
                    ? switchPreview?.paymentRequired && lockedProvider === "stripe"
                      ? "Opening Stripe…"
                      : "Scheduling…"
                    : switchPreview?.paymentRequired && lockedProvider === "stripe"
                      ? "Continue to Stripe"
                      : switchCopy.button}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function monthlyPrices(plan: BillingPlanView): Record<BillingCurrency, number> {
  const catalog = planByCode(plan.code)?.monthly;
  const base = {
    USD: plan.monthlyUsd,
    GBP: plan.monthlyGbp,
    INR: plan.monthlyInr,
    AUD: catalog?.AUD ?? plan.monthlyGbp,
    NZD: catalog?.NZD ?? plan.monthlyGbp,
  };
  if (plan.listPrice?.monthlyMinor != null && isBillingCurrency(plan.listPrice.currency)) {
    return { ...base, [plan.listPrice.currency]: plan.listPrice.monthlyMinor };
  }
  return base;
}

function PlanPicker({
  data,
  interval,
  quotes,
  appliedCode,
  showPromo,
  offerCode,
  busy,
  onInterval,
  onOfferCode,
  onShowPromo,
  onApply,
  onChoose,
}: {
  data: BillingOverview;
  interval: BillingInterval;
  quotes: Record<string, PriceQuote>;
  appliedCode: string;
  showPromo: boolean;
  offerCode: string;
  busy: boolean;
  onInterval: (interval: BillingInterval) => void;
  onOfferCode: (code: string) => void;
  onShowPromo: () => void;
  onApply: () => void;
  onChoose: (plan: BillingPlanView) => void;
}) {
  const plans = visiblePlans(data);
  const anyPriced = plans.some((plan) => plan.pricePublished);
  const anyListPrices = plans.some((plan) => plan.listPrice?.monthlyMinor != null);
  const anyYearly = plans.some(
    (plan) =>
      plan.listPrice?.yearlyMinor != null || (plan.pricePublished && plan.monthlyMinor !== null),
  );
  const anyPromo = anyPriced || (anyListPrices && paymentProviderReady(data));
  const trialPlan = plans.find((plan) => plan.code === data.settings.trialPlanCode);
  return (
    <>
      <PaymentSetupCallout data={data} plans={plans} />
      <div className="flex flex-col items-center gap-3">
        <div
          className={cn("inline-flex rounded-full border bg-muted/40 p-1", !anyYearly && "hidden")}
          role="group"
          aria-label="Billing period"
        >
          <Button
            type="button"
            size="sm"
            className="rounded-full"
            variant={interval === "month" ? "default" : "ghost"}
            onClick={() => onInterval("month")}
          >
            Monthly
          </Button>
          <Button
            type="button"
            size="sm"
            className="rounded-full"
            variant={interval === "year" ? "default" : "ghost"}
            onClick={() => onInterval("year")}
          >
            Yearly
            {data.settings.annualFreeMonths > 0 ? " · 2 months free" : ""}
          </Button>
        </div>
        {!anyPromo ? null : showPromo ? (
          <form
            className="flex flex-wrap items-end justify-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              onApply();
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="promo-code" className="sr-only">
                Promo code
              </Label>
              <Input
                id="promo-code"
                value={offerCode}
                onChange={(event) => onOfferCode(event.target.value.toUpperCase())}
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
            onClick={onShowPromo}
          >
            {appliedCode ? `Promo ${appliedCode} applied` : "Add promo code"}
          </button>
        )}
      </div>

      <div
        className={cn(
          "grid gap-4 md:grid-cols-2",
          plans.length > 3 ? "xl:grid-cols-4" : "xl:grid-cols-3",
        )}
      >
        {plans.map((plan) => (
          <PlanCard
            key={plan.code}
            plan={plan}
            overview={data}
            interval={interval}
            quote={quotes[plan.code] ?? null}
            busy={busy}
            onChoose={() => onChoose(plan)}
          />
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Prices are per organisation and exclude local tax.
        {trialPlan?.trialEnabled
          ? ` A new organisation starts a ${trialPlan.trialDays}-day ${trialPlan.name} trial with no card.`
          : ""}{" "}
        The ledger is the same on every plan.
      </p>
    </>
  );
}

function AccountSummary({
  data,
  portalPending,
  reversePending,
  scheduledPlanName,
  onPortal,
  onReverseScheduled,
}: {
  data: BillingOverview;
  portalPending: boolean;
  reversePending: boolean;
  scheduledPlanName: string | null;
  onPortal: () => void;
  onReverseScheduled: () => void;
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
          <Badge
            variant={
              sub?.status === "active"
                ? "success"
                : sub?.status === "past_due"
                  ? "destructive"
                  : "secondary"
            }
          >
            {sub ? statusLabel(sub.status) : "No subscription"}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {sub ? (
            <>
              {sub.planName}
              {sub.interval ? ` · ${sub.interval === "year" ? "Yearly" : "Monthly"}` : ""}
              {renewal ? ` · ${renewal}` : ""}
              {sub.cancelAtPeriodEnd ? " · Cancels at period end" : ""}
              {scheduledPlanName && sub.scheduledAt
                ? ` · Changes to ${scheduledPlanName} on ${new Date(sub.scheduledAt).toLocaleDateString()}`
                : ""}
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
        {scheduledPlanName && sub?.scheduledAt ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={reversePending}
            onClick={onReverseScheduled}
          >
            {reversePending ? "Reversing…" : "Keep current plan"}
          </Button>
        ) : null}
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
  const current =
    overview.subscription?.planCode === plan.code && overview.subscription.interval === interval;
  const paidHere = current && paidSubscription(overview.subscription);
  const recommended = plan.code === overview.settings.trialPlanCode && !current;
  const list =
    plan.monthlyMinor === null
      ? null
      : listAmount(plan.monthlyMinor, interval, overview.settings.annualFreeMonths);
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
        {recommended ? <Badge variant="info">Recommended</Badge> : null}
      </div>
      {due === null && plan.listPrice?.monthlyMinor != null ? (
        <p className="mt-5">
          <span className="text-3xl font-semibold tracking-tight">
            {formatMinorAmount(BigInt(plan.listPrice.monthlyMinor), plan.listPrice.currency)}
          </span>
          <span className="text-sm text-muted-foreground"> / month</span>
        </p>
      ) : due === null ? (
        <p className="mt-5 text-xl font-semibold tracking-tight">Price coming soon</p>
      ) : (
        <p className="mt-5">
          <span className="text-3xl font-semibold tracking-tight">
            {formatMinor(due, overview.currency)}
          </span>
          <span className="text-sm text-muted-foreground">
            {" "}
            / {interval === "year" ? "year" : "month"}
          </span>
        </p>
      )}
      {due === null ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {[
            plan.trialEnabled ? `${plan.trialDays}-day free trial, no card needed` : null,
            !plan.pricePublished ? "Online payment opens soon" : null,
            plan.pricePublished && !plan.checkoutReady
              ? "Payment provider keys are missing on the server"
              : null,
          ]
            .filter(Boolean)
            .join(". ") || "Not yet on sale"}
        </p>
      ) : quote && quote.discountMinor > 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">
          List {formatMinor(quote.listMinor, overview.currency)} with {quote.offerCode}
        </p>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">
          {plan.pricePublished && !plan.checkoutReady
            ? "Payment provider keys are missing on the server"
            : interval === "year"
              ? "Billed once a year"
              : "Billed monthly"}
        </p>
      )}
      <Button
        type="button"
        className="mt-4 w-full"
        variant={recommended ? "default" : "outline"}
        disabled={busy || paidHere || !plan.checkoutReady}
        onClick={onChoose}
      >
        {paidHere
          ? "Current plan"
          : !plan.pricePublished
            ? "Available soon"
            : !plan.checkoutReady
              ? "Setup required"
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
