import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  checkoutCurrencyForCountry,
  parseCheckoutBilling,
  paymentMethodsFor,
  type CheckoutBillingInput,
  type PayMethodId,
  type PaymentProviderAvailability,
} from "@/lib/billing/checkout-payload";
import { billingCountries } from "@/lib/billing/billing-countries";
import {
  formatMinor,
  listAmount,
  type BillingCurrency,
  type BillingInterval,
  type PriceQuote,
} from "@/lib/billing/pricing";
import { cn } from "@/lib/utils";

const EMPTY_BILLING: Required<CheckoutBillingInput> = {
  email: "",
  firstName: "",
  lastName: "",
  company: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "",
};

export function CheckoutForm({
  planName,
  interval,
  monthly,
  annualFreeMonths,
  companyName,
  defaultCountry,
  busy,
  serverError,
  providers,
  quote,
  quoteLoading,
  quoteError,
  priceCurrency,
  onBack,
  onPay,
}: {
  planName: string;
  interval: BillingInterval;
  monthly: Record<BillingCurrency, number>;
  annualFreeMonths: number;
  companyName: string;
  defaultCountry: string;
  busy: boolean;
  serverError: string | null;
  providers: PaymentProviderAvailability;
  quote: PriceQuote | null;
  quoteLoading: boolean;
  quoteError: string | null;
  /** Country price-book plans are priced by the server, not by the billing country. */
  priceCurrency?: BillingCurrency | undefined;
  onBack: () => void;
  onPay: (billing: CheckoutBillingInput, method: PayMethodId, copy: boolean) => void;
}) {
  const [billing, setBilling] = useState<Required<CheckoutBillingInput>>(() => ({
    ...EMPTY_BILLING,
    company: companyName,
    country: defaultCountry,
  }));
  const [method, setMethod] = useState<PayMethodId>("card");
  const [error, setError] = useState("");
  const currency = priceCurrency ?? checkoutCurrencyForCountry(defaultCountry);
  const dueMinor = quote && quote.currency === currency ? quote.dueMinor : null;
  const available = paymentMethodsFor(defaultCountry, providers).filter((item) => item.available);

  const { stripe, razorpay } = providers;

  useEffect(() => {
    // Country comes from the server, not an editable country picker or browser locale.
    setBilling((current) => ({ ...current, country: defaultCountry }));
    const choices = paymentMethodsFor(defaultCountry, { stripe, razorpay }).filter(
      (item) => item.available,
    );
    setMethod(choices.find((item) => item.id === "upi")?.id ?? choices[0]?.id ?? "card");
  }, [defaultCountry, stripe, razorpay]);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      const email = data.user?.email?.trim();
      if (!email) return;
      setBilling((current) => (current.email ? current : { ...current, email }));
    });
  }, []);

  function update(field: keyof CheckoutBillingInput, value: string) {
    setBilling((current) => ({ ...current, [field]: value }));
    setError("");
  }

  function submit(copy: boolean) {
    try {
      parseCheckoutBilling(billing);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Check the billing details.");
      return;
    }
    if (quoteLoading || !quote || quote.currency !== currency || quoteError) {
      setError("The current country-specific price is not ready. Please review the order summary.");
      return;
    }
    if (!available.some((item) => item.id === method)) {
      setError("Choose a payment method.");
      return;
    }
    setError("");
    onPay(billing, method, copy);
  }

  return (
    <div className="space-y-4">
      <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={onBack}>
        <ArrowLeft className="size-4" />
        Plans
      </Button>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <form
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            submit(false);
          }}
        >
          <section className="space-y-3 rounded-xl border bg-card p-5">
            <h2 className="text-base font-semibold">Contact</h2>
            <Field label="Email" id="bill-email">
              <Input
                id="bill-email"
                type="email"
                autoComplete="email"
                value={billing.email}
                onChange={(event) => update("email", event.target.value)}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="First name" id="bill-first">
                <Input
                  id="bill-first"
                  autoComplete="given-name"
                  value={billing.firstName}
                  onChange={(event) => update("firstName", event.target.value)}
                />
              </Field>
              <Field label="Last name" id="bill-last">
                <Input
                  id="bill-last"
                  autoComplete="family-name"
                  value={billing.lastName}
                  onChange={(event) => update("lastName", event.target.value)}
                />
              </Field>
            </div>
            <Field label="Company" id="bill-company">
              <Input
                id="bill-company"
                autoComplete="organization"
                value={billing.company}
                onChange={(event) => update("company", event.target.value)}
              />
            </Field>
          </section>

          <section className="space-y-3 rounded-xl border bg-card p-5">
            <h2 className="text-base font-semibold">Billing address</h2>
            <Field label="Address" id="bill-line1">
              <Input
                id="bill-line1"
                autoComplete="address-line1"
                value={billing.line1}
                onChange={(event) => update("line1", event.target.value)}
              />
            </Field>
            <Field label="Apartment, suite (optional)" id="bill-line2">
              <Input
                id="bill-line2"
                autoComplete="address-line2"
                value={billing.line2}
                onChange={(event) => update("line2", event.target.value)}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="City" id="bill-city">
                <Input
                  id="bill-city"
                  autoComplete="address-level2"
                  value={billing.city}
                  onChange={(event) => update("city", event.target.value)}
                />
              </Field>
              <Field label="State / county" id="bill-state">
                <Input
                  id="bill-state"
                  autoComplete="address-level1"
                  value={billing.state}
                  onChange={(event) => update("state", event.target.value)}
                />
              </Field>
              <Field label="Postal code" id="bill-postal">
                <Input
                  id="bill-postal"
                  autoComplete="postal-code"
                  value={billing.postalCode}
                  onChange={(event) => update("postalCode", event.target.value)}
                />
              </Field>
              <div className="space-y-1" aria-label="Billing region">
                <p className="text-sm font-medium">Billing region</p>
                <p className="rounded-md border border-input bg-muted/30 px-3 py-2 text-sm">
                  {billingCountries.find((item) => item.code === defaultCountry)?.name ??
                    defaultCountry}{" "}
                  · {currency}
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-3 rounded-xl border bg-card p-5">
            <h2 className="text-base font-semibold">Pay with</h2>
            <p className="text-sm text-muted-foreground">
              Payment methods depend on your billing country, the provider's capabilities and which
              options are enabled for LinkBooks. Stripe selects eligible cards, wallets and local
              payment methods on its hosted checkout. Indian UPI AutoPay and bank e-mandates use
              Razorpay. LinkBooks never collects card numbers, UPI IDs or bank credentials.
            </p>
            {currency ? (
              <RadioGroup
                value={method}
                onValueChange={(value) => {
                  if (available.some((item) => item.id === value)) setMethod(value as PayMethodId);
                }}
                className="gap-2"
                aria-label="Payment method"
              >
                {available.map((item) => {
                  const selected = method === item.id;
                  return (
                    <label
                      key={item.id}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3",
                        selected && "border-primary bg-primary/5",
                      )}
                    >
                      <RadioGroupItem value={item.id} className="mt-0.5" />
                      <span>
                        <span className="block text-sm font-medium">{item.title}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {item.detail}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </RadioGroup>
            ) : (
              <p className="text-sm text-muted-foreground">
                Local payment methods will appear when an eligible processor is configured.
              </p>
            )}
            {currency && available.length === 0 ? (
              <p className="text-sm text-destructive">
                No payment processor is configured for this country. The platform owner must enable
                an eligible provider before checkout.
              </p>
            ) : null}
          </section>
        </form>

        <aside className="space-y-4 rounded-xl border bg-card p-5 lg:sticky lg:top-4">
          <h2 className="text-base font-semibold">Order summary</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{planName}</dt>
              <dd>
                {currency
                  ? formatMinor(
                      quote?.currency === currency
                        ? quote.listMinor
                        : listAmount(monthly[currency], interval, annualFreeMonths),
                      currency,
                    )
                  : "—"}
              </dd>
            </div>
            {quote?.taxMinor && quote.taxLabel && quote.currency === currency ? (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">
                  {quote.taxIncluded ? `Includes ${quote.taxLabel}` : quote.taxLabel}
                </dt>
                <dd>{formatMinor(quote.taxMinor, quote.currency)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Billing</dt>
              <dd>
                {interval === "year" ? "Yearly" : "Monthly"}
                {currency ? ` · ${currency}` : ""}
              </dd>
            </div>
            <div className="flex justify-between gap-3 border-t pt-2 text-base font-semibold">
              <dt>Due at checkout</dt>
              <dd>
                {dueMinor != null && currency
                  ? formatMinor(dueMinor, currency)
                  : quoteLoading
                    ? "Calculating…"
                    : "—"}
              </dd>
            </div>
          </dl>
          {quote?.discountMinor ? (
            <p className="text-xs text-green-700 dark:text-green-400">
              Promotion applied: {formatMinor(quote.discountMinor, quote.currency)} reduction.
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            The billing currency follows your organisation region; markets without a supported local
            price currently use USD.{" "}
            {quote?.taxLabel
              ? `${quote.taxLabel} is shown as configured for your country and appears on your invoice.`
              : "No tax is added for your country."}{" "}
            Payment methods will be confirmed by the hosted provider.
          </p>
          {error || serverError || quoteError ? (
            <p role="alert" className="text-sm text-destructive-ink">
              {error || serverError || quoteError}
            </p>
          ) : null}
          <Button
            type="button"
            className="w-full"
            disabled={busy || quoteLoading || dueMinor == null || !available.length}
            onClick={() => submit(false)}
          >
            {busy ? "Opening secure payment…" : "Continue to payment"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={busy || quoteLoading || dueMinor == null || !available.length}
            onClick={() => submit(true)}
          >
            Copy payment link
          </Button>
          <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
            <Lock className="size-3" aria-hidden />
            Secure checkout
          </p>
        </aside>
      </div>
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
