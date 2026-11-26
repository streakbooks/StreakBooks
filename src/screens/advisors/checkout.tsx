import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Check, LoaderCircle, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatAdvisorPlanPrice, isAdvisorServiceCode } from "@/lib/advisors/catalogue";
import { listPublicAdvisorServices } from "@/lib/advisors/public.functions";

type CheckoutDetails = {
  key_id: string;
  purchase_id: string;
  order_id?: string;
  subscription_id?: string;
  amount: number;
  currency: string;
  cadence: "month" | "session";
  name: string;
  description: string;
  buyer_name: string;
  buyer_email: string;
  buyer_phone: string;
};

type RazorpaySuccess = {
  razorpay_payment_id: string;
  razorpay_order_id?: string;
  razorpay_subscription_id?: string;
  razorpay_signature: string;
};

type RazorpayOptions = Omit<CheckoutDetails, "key_id"> & {
  key: string;
  handler: (result: RazorpaySuccess) => void | Promise<void>;
  modal: { ondismiss: () => void };
  prefill: { name: string; email: string; contact: string };
  theme: { color: string };
  notes: { purchase_id: string };
};

type RazorpayInstance = {
  open: () => void;
  on: (
    event: "payment.failed",
    callback: (event: { error?: { description?: string } }) => void,
  ) => void;
};

export function AdvisorsCheckoutPage({
  serviceCode,
  planCode,
}: {
  serviceCode: string;
  planCode: string;
}) {
  const load = useServerFn(listPublicAdvisorServices);
  const catalogue = useQuery({
    queryKey: ["public-advisor-services"],
    queryFn: () => load(),
    retry: false,
  });
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paidStatus, setPaidStatus] = useState<"paid" | "authorized" | null>(null);
  const [scriptReady, setScriptReady] = useState(
    () => typeof window !== "undefined" && Boolean(window.Razorpay),
  );

  useEffect(() => {
    if (window.Razorpay) {
      setScriptReady(true);
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://checkout.razorpay.com/v1/checkout.js"]',
    );
    const script = existing ?? document.createElement("script");
    const onLoad = () => setScriptReady(true);
    const onError = () =>
      setError("Razorpay checkout could not load. Check your connection and retry.");
    script.addEventListener("load", onLoad);
    script.addEventListener("error", onError);
    if (!existing) {
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      document.body.appendChild(script);
    }
    return () => {
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
    };
  }, []);

  const selected = useMemo(() => {
    if (!isAdvisorServiceCode(serviceCode)) return null;
    const service = catalogue.data?.services.find((item) => item.code === serviceCode);
    const plan = service?.plans.find((item) => item.code === planCode);
    return service && plan ? { service, plan } : null;
  }, [catalogue.data, planCode, serviceCode]);

  async function startCheckout(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !scriptReady || !window.Razorpay || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/advisors/create-checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          serviceCode: selected.service.code,
          planCode: selected.plan.code,
          buyerName,
          buyerEmail,
          buyerPhone,
        }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !payload || typeof payload !== "object") {
        const message =
          payload &&
          typeof payload === "object" &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "Could not start checkout. Please try again.";
        throw new Error(message);
      }

      const details = payload as CheckoutDetails;
      const { key_id: key, ...checkoutDetails } = details;
      const options: RazorpayOptions = {
        ...checkoutDetails,
        key,
        handler: async (result) => {
          try {
            const verification = await fetch("/api/advisors/verify-payment", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ purchase_id: details.purchase_id, ...result }),
            });
            const verified: unknown = await verification.json().catch(() => null);
            if (
              !verification.ok ||
              !verified ||
              typeof verified !== "object" ||
              !("verified" in verified && verified.verified === true)
            ) {
              const message =
                verified &&
                typeof verified === "object" &&
                "error" in verified &&
                typeof verified.error === "string"
                  ? verified.error
                  : "Payment could not be verified. Contact Advisors support before retrying.";
              throw new Error(message);
            }
            const status = "status" in verified ? verified.status : undefined;
            setPaidStatus(status === "paid" ? "paid" : "authorized");
          } catch (verifyError) {
            setError(
              verifyError instanceof Error
                ? verifyError.message
                : "Payment could not be verified. Contact Advisors support.",
            );
          } finally {
            setBusy(false);
          }
        },
        modal: {
          ondismiss: () => {
            setBusy(false);
            setError("Checkout closed. No payment was confirmed.");
          },
        },
        prefill: { name: buyerName, email: buyerEmail, contact: buyerPhone },
        theme: { color: "#61435f" },
        notes: { purchase_id: details.purchase_id },
      };
      const RazorpayCheckout = window.Razorpay as unknown as
        (new (checkoutOptions: RazorpayOptions) => RazorpayInstance) | undefined;
      if (!RazorpayCheckout) throw new Error("Razorpay checkout is not ready. Please retry.");
      const checkout = new RazorpayCheckout(options);
      checkout.on("payment.failed", (failure) => {
        setBusy(false);
        setError(failure.error?.description || "Razorpay could not complete the payment.");
      });
      checkout.open();
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error ? checkoutError.message : "Checkout could not start.",
      );
      setBusy(false);
    }
  }

  if (catalogue.isPending) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-16 text-sm text-muted-foreground">
        Loading checkout…
      </main>
    );
  }

  if (!selected) {
    return (
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-16">
        <h1 className="text-2xl font-semibold">Plan not found</h1>
        <p className="text-sm text-muted-foreground">
          Return to Advisors and choose a current service plan.
        </p>
        <Button asChild variant="outline">
          <Link to="/advisors">Back to Advisors</Link>
        </Button>
      </main>
    );
  }

  if (paidStatus) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <section
          className="space-y-4 rounded-2xl border bg-card p-8 shadow-card"
          aria-live="polite"
        >
          <Check className="size-8 text-success" aria-hidden="true" />
          <h1 className="text-2xl font-semibold">
            {paidStatus === "paid" ? "Payment complete" : "Subscription authorised"}
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {paidStatus === "paid"
              ? `Your ${selected.plan.name} payment is confirmed. Keep your Razorpay receipt for your records.`
              : `Your ${selected.plan.name} monthly mandate is authorised. The subscription will be active after Razorpay confirms activation.`}
          </p>
          <p className="text-xs text-muted-foreground">
            This is a Link Business Advisory purchase, separate from your StreakBooks software
            subscription.
          </p>
          <Button asChild variant="outline">
            <Link to="/advisors">Return to Advisors</Link>
          </Button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:py-14">
      <div className="mx-auto max-w-5xl space-y-6">
        <Button asChild variant="ghost" size="sm">
          <Link to="/advisors/$serviceCode" params={{ serviceCode: selected.service.code }}>
            <ArrowLeft className="size-4" aria-hidden="true" /> Back to {selected.service.name}
          </Link>
        </Button>
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <section className="rounded-2xl border bg-card p-5 shadow-card sm:p-7">
            <h1 className="text-2xl font-semibold tracking-tight">Advisors checkout</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Enter your contact details to continue to Razorpay’s secure payment window.
            </p>
            <form className="mt-6 space-y-5" onSubmit={startCheckout}>
              <div className="space-y-2">
                <Label htmlFor="advisor-buyer-name">Full name</Label>
                <Input
                  id="advisor-buyer-name"
                  autoComplete="name"
                  maxLength={120}
                  required
                  value={buyerName}
                  onChange={(event) => setBuyerName(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="advisor-buyer-email">Email</Label>
                <Input
                  id="advisor-buyer-email"
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  required
                  value={buyerEmail}
                  onChange={(event) => setBuyerEmail(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="advisor-buyer-phone">Phone</Label>
                <Input
                  id="advisor-buyer-phone"
                  type="tel"
                  autoComplete="tel"
                  minLength={7}
                  maxLength={32}
                  required
                  value={buyerPhone}
                  onChange={(event) => setBuyerPhone(event.target.value)}
                />
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {selected.plan.cadence === "month"
                  ? "This is a recurring monthly Advisors subscription. Razorpay will show the payment and mandate details before you confirm."
                  : "This is a one-time Advisors session purchase."}{" "}
                Link Business Advisory processes it separately from your StreakBooks software
                subscription.
              </p>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button className="w-full" size="lg" type="submit" disabled={busy || !scriptReady}>
                {busy ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <LockKeyhole className="size-4" aria-hidden="true" />
                )}
                {busy
                  ? "Connecting to Razorpay…"
                  : scriptReady
                    ? "Continue to secure payment"
                    : "Loading secure checkout…"}
              </Button>
            </form>
          </section>

          <aside
            className="h-fit space-y-4 rounded-2xl border bg-card p-5 shadow-card sm:p-6"
            aria-label="Order summary"
          >
            <h2 className="text-lg font-semibold">Order summary</h2>
            <div className="flex items-start justify-between gap-4 text-sm">
              <div>
                <p className="font-medium">{selected.plan.name}</p>
                <p className="mt-1 text-muted-foreground">{selected.service.name}</p>
              </div>
              <p className="shrink-0 font-semibold">{formatAdvisorPlanPrice(selected.plan)}</p>
            </div>
            <div className="border-t pt-4 text-sm text-muted-foreground">
              Due {selected.plan.cadence === "month" ? "monthly" : "once"}
              <p className="mt-3 leading-relaxed">
                Link Business Advisory processes Advisors payments separately from StreakBooks
                software billing. Razorpay confirms available payment methods and any applicable
                taxes.
              </p>
            </div>
            <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <LockKeyhole className="size-3.5" aria-hidden="true" /> Secure checkout by Razorpay
            </p>
          </aside>
        </div>
      </div>
    </main>
  );
}
