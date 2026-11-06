import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { LookupSelect } from "@/components/lookup";
import { MultiLookupSelect } from "@/components/lookup/MultiLookupSelect";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getCoupons,
  linkProviderCoupon,
  saveCoupon,
  type CouponRow,
} from "@/lib/billing/coupon-admin.functions";
import { formatMinorAmount, parseAmountToMinor } from "@/lib/billing/domain/money";
import { ISO_COUNTRIES } from "@/lib/billing/reference/iso-reference-data";

const queryKey = ["platform-coupons"] as const;
const COUNTRY_OPTIONS = ISO_COUNTRIES.map((item) => ({
  id: item.code,
  label: item.name,
  code: item.code,
}));
const CURRENCY_OPTIONS = ["USD", "GBP", "AUD", "NZD", "INR"].map((code) => ({
  id: code,
  label: code,
}));
const PLAN_OPTIONS = [
  { id: "standard", label: "Standard" },
  { id: "pro", label: "Pro" },
  { id: "business", label: "Business" },
];

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function describe(coupon: CouponRow): string {
  const value =
    coupon.kind === "percent"
      ? `${(coupon.percent_bps / 100).toFixed(2)}% off`
      : coupon.kind === "amount" && coupon.amount_currency
        ? `${formatMinorAmount(BigInt(coupon.amount_minor), coupon.amount_currency)} off`
        : coupon.kind.replace(/_/g, " ");
  const duration =
    coupon.duration_type === "repeating"
      ? `for ${coupon.duration_months} months`
      : coupon.duration_type === "forever"
        ? "every period"
        : "first period";
  return `${value}, ${duration}`;
}

export function CouponsAdmin({ canEdit }: { canEdit: boolean }) {
  const load = useServerFn(getCoupons);
  const query = useQuery({ queryKey, queryFn: () => load(), retry: false });
  return (
    <section className="space-y-4" aria-labelledby="coupons-heading">
      <header className="space-y-1">
        <h2 id="coupons-heading" className="text-xl font-semibold">
          Promo codes
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          One code per checkout. A code&apos;s discount cannot change once it has been used; create
          a new code instead. Razorpay offers are created in the Razorpay Dashboard and linked here.
        </p>
      </header>
      {query.isError ? (
        <p className="text-sm text-destructive">
          {errorText(query.error, "Codes could not be loaded.")}
        </p>
      ) : null}
      <ul className="space-y-2 text-sm">
        {(query.data ?? []).map((coupon) => (
          <li key={coupon.code} className="flex flex-wrap items-center gap-2">
            <Badge variant={coupon.is_active ? "success" : "secondary"}>
              {coupon.is_active ? "active" : "off"}
            </Badge>
            <span className="font-medium">{coupon.code}</span>
            <span>
              {describe(coupon)}
              {coupon.plan_codes?.length ? ` · ${coupon.plan_codes.join(", ")}` : " · all plans"}
              {coupon.countries?.length ? ` · ${coupon.countries.join(", ")}` : ""} · used{" "}
              {coupon.redemption_count}
              {coupon.max_redemptions ? ` of ${coupon.max_redemptions}` : ""}
              {coupon.reserved ? ` (${coupon.reserved} in checkout)` : ""}
              {coupon.mappings.length
                ? ` · ${coupon.mappings.map((m) => `${m.provider} ${m.mode}`).join(", ")}`
                : ""}
            </span>
          </li>
        ))}
      </ul>
      {canEdit ? <CouponForm /> : null}
      {canEdit ? <LinkForm codes={(query.data ?? []).map((c) => c.code)} /> : null}
    </section>
  );
}

function CouponForm() {
  const save = useServerFn(saveCoupon);
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    code: "",
    name: "",
    kind: "percent" as "percent" | "amount",
    percent: "",
    amount: "",
    currency: "USD",
    durationType: "once" as "once" | "repeating" | "forever",
    months: "",
    intervals: "any" as "any" | "month" | "year",
    startsOn: "",
    endsOn: "",
    max: "",
    perAccount: "1",
    minAmount: "",
    minCurrency: "USD",
    active: false,
    reason: "",
  });
  const [plans, setPlans] = useState<string[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const update = <K extends keyof typeof form>(field: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [field]: value }));
  const optionalInt = (value: string) => (value.trim() ? Number(value) : null);
  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          code: form.code.toUpperCase(),
          name: form.name,
          kind: form.kind,
          percentBps: form.kind === "percent" ? Math.round(Number(form.percent || "0") * 100) : 0,
          amountMinor:
            form.kind === "amount" && form.amount.trim()
              ? Number(parseAmountToMinor(form.amount.trim(), form.currency))
              : 0,
          amountCurrency: form.kind === "amount" ? form.currency : "",
          durationType: form.durationType,
          durationMonths: form.durationType === "repeating" ? optionalInt(form.months) : null,
          intervals: form.intervals,
          planCodes: plans,
          countries,
          startsOn: form.startsOn,
          endsOn: form.endsOn,
          maxRedemptions: optionalInt(form.max),
          perAccountLimit: optionalInt(form.perAccount),
          minPurchaseMinor: form.minAmount.trim()
            ? Number(parseAmountToMinor(form.minAmount.trim(), form.minCurrency))
            : null,
          minPurchaseCurrency: form.minAmount.trim() ? form.minCurrency : "",
          active: form.active,
          reason: form.reason,
        },
      }),
    onSuccess: () => {
      toast.success("Promo code saved.");
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => toast.error(errorText(error, "The code could not be saved.")),
  });
  return (
    <form
      className="grid gap-3 sm:grid-cols-4"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <h3 className="font-medium sm:col-span-4">Create or update a code</h3>
      <label className="text-sm">
        Code
        <Input
          className="mt-1"
          value={form.code}
          onChange={(e) => update("code", e.target.value.toUpperCase())}
        />
      </label>
      <label className="text-sm">
        Name
        <Input
          className="mt-1"
          value={form.name}
          onChange={(e) => update("name", e.target.value)}
        />
      </label>
      <label className="text-sm">
        Discount
        <select
          className="mt-1 flex h-9 w-full rounded-md border bg-transparent px-2"
          value={form.kind}
          onChange={(e) => update("kind", e.target.value === "amount" ? "amount" : "percent")}
        >
          <option value="percent">Percentage</option>
          <option value="amount">Fixed amount</option>
        </select>
      </label>
      {form.kind === "percent" ? (
        <label className="text-sm">
          Percent off (max 50)
          <Input
            className="mt-1"
            inputMode="decimal"
            value={form.percent}
            onChange={(e) => update("percent", e.target.value)}
          />
        </label>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm">
            Amount off
            <Input
              className="mt-1"
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => update("amount", e.target.value)}
            />
          </label>
          <label className="text-sm">
            Currency
            <LookupSelect
              options={CURRENCY_OPTIONS}
              value={form.currency}
              onChange={(id) => update("currency", id)}
              ariaLabel="Currency"
            />
          </label>
        </div>
      )}
      <label className="text-sm">
        Applies
        <select
          className="mt-1 flex h-9 w-full rounded-md border bg-transparent px-2"
          value={form.durationType}
          onChange={(e) => update("durationType", e.target.value as typeof form.durationType)}
        >
          <option value="once">First billing period</option>
          <option value="repeating">For a number of months</option>
          <option value="forever">Every billing period</option>
        </select>
      </label>
      <label className="text-sm">
        Months (1–36)
        <Input
          className="mt-1"
          inputMode="numeric"
          disabled={form.durationType !== "repeating"}
          value={form.months}
          onChange={(e) => update("months", e.target.value)}
        />
      </label>
      <label className="text-sm">
        Billing periods
        <select
          className="mt-1 flex h-9 w-full rounded-md border bg-transparent px-2"
          value={form.intervals}
          onChange={(e) => update("intervals", e.target.value as typeof form.intervals)}
        >
          <option value="any">Monthly and yearly</option>
          <option value="month">Monthly only</option>
          <option value="year">Yearly only</option>
        </select>
      </label>
      <div className="text-sm">
        Plans (empty for all)
        <MultiLookupSelect
          options={PLAN_OPTIONS}
          values={plans}
          onValuesChange={setPlans}
          ariaLabel="Plans"
        />
      </div>
      <div className="text-sm">
        Countries (empty for all)
        <MultiLookupSelect
          options={COUNTRY_OPTIONS}
          values={countries}
          onValuesChange={setCountries}
          ariaLabel="Countries"
        />
      </div>
      <label className="text-sm">
        Starts
        <Input
          className="mt-1"
          type="date"
          value={form.startsOn}
          onChange={(e) => update("startsOn", e.target.value)}
        />
      </label>
      <label className="text-sm">
        Ends
        <Input
          className="mt-1"
          type="date"
          value={form.endsOn}
          onChange={(e) => update("endsOn", e.target.value)}
        />
      </label>
      <label className="text-sm">
        Total uses (empty for unlimited)
        <Input
          className="mt-1"
          inputMode="numeric"
          value={form.max}
          onChange={(e) => update("max", e.target.value)}
        />
      </label>
      <label className="text-sm">
        Uses per customer account
        <Input
          className="mt-1"
          inputMode="numeric"
          value={form.perAccount}
          onChange={(e) => update("perAccount", e.target.value)}
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm">
          Minimum purchase
          <Input
            className="mt-1"
            inputMode="decimal"
            value={form.minAmount}
            onChange={(e) => update("minAmount", e.target.value)}
          />
        </label>
        <label className="text-sm">
          Currency
          <LookupSelect
            options={CURRENCY_OPTIONS}
            value={form.minCurrency}
            onChange={(id) => update("minCurrency", id)}
            ariaLabel="Minimum currency"
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.active}
          onChange={(e) => update("active", e.target.checked)}
        />
        Active
      </label>
      <label className="text-sm sm:col-span-2">
        Reason
        <Input
          className="mt-1"
          value={form.reason}
          onChange={(e) => update("reason", e.target.value)}
        />
      </label>
      <Button type="submit" className="self-end sm:w-fit" disabled={mutation.isPending}>
        Save code
      </Button>
    </form>
  );
}

function LinkForm({ codes }: { codes: string[] }) {
  const link = useServerFn(linkProviderCoupon);
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [mode, setMode] = useState<"test" | "live">("test");
  const [couponId, setCouponId] = useState("");
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: () => link({ data: { code, provider: "razorpay", mode, couponId, reason } }),
    onSuccess: () => {
      toast.success("Razorpay offer linked.");
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => toast.error(errorText(error, "The offer could not be linked.")),
  });
  return (
    <form
      className="grid gap-3 sm:grid-cols-5"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <h3 className="font-medium sm:col-span-5">Link a Razorpay offer</h3>
      <label className="text-sm">
        Code
        <LookupSelect
          options={codes.map((c) => ({ id: c, label: c }))}
          value={code}
          onChange={setCode}
          ariaLabel="Code"
        />
      </label>
      <label className="text-sm">
        Mode
        <select
          className="mt-1 flex h-9 w-full rounded-md border bg-transparent px-2"
          value={mode}
          onChange={(e) => setMode(e.target.value === "live" ? "live" : "test")}
        >
          <option value="test">Test</option>
          <option value="live">Live</option>
        </select>
      </label>
      <label className="text-sm">
        Razorpay offer id
        <Input
          className="mt-1"
          value={couponId}
          onChange={(e) => setCouponId(e.target.value)}
          placeholder="offer_…"
        />
      </label>
      <label className="text-sm">
        Reason
        <Input className="mt-1" value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <Button type="submit" className="self-end sm:w-fit" disabled={mutation.isPending || !code}>
        Link offer
      </Button>
    </form>
  );
}
