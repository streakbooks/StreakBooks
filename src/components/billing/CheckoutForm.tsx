import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  parseCheckoutBilling,
  paymentMethodsFor,
  type CheckoutBillingInput,
  type PayMethodId,
} from "@/lib/billing/checkout-payload";
import { countries } from "@/lib/company-constants";
import { formatMinor, type BillingCurrency, type BillingInterval } from "@/lib/billing/pricing";
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
  country: "GB",
};

export function CheckoutForm({
  planName,
  interval,
  currency,
  dueMinor,
  listMinor,
  offerCode,
  companyName,
  countryCode,
  busy,
  serverError,
  onBack,
  onPay,
}: {
  planName: string;
  interval: BillingInterval;
  currency: BillingCurrency;
  dueMinor: number;
  listMinor: number | null;
  offerCode: string | null;
  companyName: string;
  countryCode: string;
  busy: boolean;
  serverError: string | null;
  onBack: () => void;
  onPay: (billing: CheckoutBillingInput, method: PayMethodId, copy: boolean) => void;
}) {
  const methods = paymentMethodsFor(currency);
  const available = methods.filter((method) => method.available);
  const elsewhere = methods.filter((method) => !method.available);
  const [billing, setBilling] = useState<Required<CheckoutBillingInput>>(() => ({
    ...EMPTY_BILLING,
    company: companyName,
    country: countries.some((item) => item.code === countryCode) ? countryCode : "GB",
  }));
  const [method, setMethod] = useState<PayMethodId>(available[0]?.id ?? "card");
  const [error, setError] = useState("");

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
              <Field label="Country" id="bill-country">
                <select
                  id="bill-country"
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  aria-label="Billing country"
                  value={billing.country}
                  onChange={(event) => update("country", event.target.value)}
                >
                  {countries.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </section>

          <section className="space-y-3 rounded-xl border bg-card p-5">
            <h2 className="text-base font-semibold">Pay with</h2>
            <p className="text-sm text-muted-foreground">
              A card is optional. Choose UPI, bank transfer or a local bank debit when it is
              available for this currency. Card numbers, UPI IDs and bank details are entered on the
              secure payment page. LinkBooks does not store them.
            </p>
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
            {elsewhere.length > 0 ? (
              <details className="text-sm text-muted-foreground">
                <summary className="cursor-pointer">Methods for other currencies</summary>
                <ul className="mt-2 space-y-1">
                  {elsewhere.map((item) => (
                    <li key={item.id}>
                      <span className="text-foreground">{item.title}.</span> {item.reason}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </section>
        </form>

        <aside className="space-y-4 rounded-xl border bg-card p-5 lg:sticky lg:top-4">
          <h2 className="text-base font-semibold">Order summary</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">{planName}</dt>
              <dd>{formatMinor(dueMinor, currency)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Billing</dt>
              <dd>{interval === "year" ? "Yearly" : "Monthly"}</dd>
            </div>
            {listMinor != null && offerCode ? (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Promo {offerCode}</dt>
                <dd>List {formatMinor(listMinor, currency)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-3 border-t pt-2 text-base font-semibold">
              <dt>Due at checkout</dt>
              <dd>{formatMinor(dueMinor, currency)}</dd>
            </div>
          </dl>
          <p className="text-xs text-muted-foreground">
            Local tax is not collected on this checkout. The subscription renews until it is
            cancelled. Nothing is charged until you confirm on the secure payment page.
          </p>
          {error || serverError ? (
            <p className="text-sm text-destructive">{error || serverError}</p>
          ) : null}
          <Button type="button" className="w-full" disabled={busy} onClick={() => submit(false)}>
            {busy ? "Opening secure payment…" : "Continue to payment"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={busy}
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
