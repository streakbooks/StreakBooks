import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { LookupSelect } from "@/components/lookup";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  draftCountryPrices,
  getCountryPricingAdmin,
  recordExchangeRate,
  saveCountryPricingRule,
  savePriceInput,
} from "@/lib/billing/country-pricing.functions";
import type { CountryPricingAdmin as AdminData } from "@/lib/billing/country-pricing";
import {
  BASE_CURRENCY,
  PRICING_STRATEGIES,
  ROUNDING_MODES,
  convertBasePrice,
  type PricingStrategy,
} from "@/lib/billing/domain/country-pricing";
import {
  formatMinorAmount,
  parseAmountToMinor,
  type RoundingMode,
} from "@/lib/billing/domain/money";
import { ISO_COUNTRIES } from "@/lib/billing/reference/iso-reference-data";

const PLAN_OPTIONS = [
  { id: "standard", label: "Standard", code: "STANDARD" },
  { id: "pro", label: "Pro", code: "PRO" },
  { id: "business", label: "Business", code: "BUSINESS" },
];
const COUNTRY_OPTIONS = ISO_COUNTRIES.map((country) => ({
  id: country.code,
  label: country.name,
  code: country.code,
  keywords: country.defaultCurrency ?? "",
}));
const BASE_OPTION = { id: "", label: "Base price (USD, all other countries)" };

function countryName(code: string | null): string {
  if (!code) return "Base (USD)";
  return ISO_COUNTRIES.find((country) => country.code === code)?.name ?? code;
}

function money(amount: number | bigint, currency: string): string {
  return formatMinorAmount(BigInt(amount), currency);
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function CountryPricingAdmin({ canEdit }: { canEdit: boolean }) {
  const load = useServerFn(getCountryPricingAdmin);
  const query = useQuery({
    queryKey: ["platform-country-pricing"],
    queryFn: () => load(),
    retry: false,
  });
  if (query.isLoading) return <p className="text-sm">Loading country pricing…</p>;
  if (query.isError) {
    return <QueryErrorState queries={[query]} title="Could not load country pricing" />;
  }
  if (!query.data) return null;
  return <CountryPricingPanels data={query.data} canEdit={canEdit} />;
}

function CountryPricingPanels({ data, canEdit }: { data: AdminData; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["platform-country-pricing"] });
    void queryClient.invalidateQueries({ queryKey: ["platform-billing"] });
  };
  const currencyOptions = useMemo(
    () =>
      data.currencies.map((currency) => ({
        id: currency.code,
        label: currency.name,
        code: currency.code,
      })),
    [data.currencies],
  );
  const rateFor = (code: string) => data.rates.find((rate) => rate.quote === code) ?? null;

  return (
    <section className="space-y-8" aria-labelledby="country-pricing-heading">
      <header className="space-y-1">
        <h2 id="country-pricing-heading" className="text-xl font-semibold">
          Country pricing
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Base prices are in USD. Countries with a FIXED or CUSTOM rule use their own prices;
          FX_CONVERTED countries convert the USD price with the latest rate, markup and rounding.
          Countries without a rule pay the USD price. Drafting creates a new plan version; another
          platform owner publishes it below.
        </p>
      </header>

      <PriceInputs
        data={data}
        canEdit={canEdit}
        currencyOptions={currencyOptions}
        onSaved={refresh}
      />
      <CountryRules
        data={data}
        canEdit={canEdit}
        currencyOptions={currencyOptions}
        rateFor={rateFor}
        onSaved={refresh}
      />
      <ExchangeRates
        data={data}
        canEdit={canEdit}
        currencyOptions={currencyOptions}
        onSaved={refresh}
      />
      {canEdit ? <DraftPrices onSaved={refresh} /> : null}
    </section>
  );
}

type CurrencyOption = { id: string; label: string; code: string };

function PriceInputs({
  data,
  canEdit,
  currencyOptions,
  onSaved,
}: {
  data: AdminData;
  canEdit: boolean;
  currencyOptions: CurrencyOption[];
  onSaved: () => void;
}) {
  const save = useServerFn(savePriceInput);
  const [plan, setPlan] = useState("pro");
  const [country, setCountry] = useState("");
  const [interval, setInterval] = useState<"month" | "year">("month");
  const [currency, setCurrency] = useState(BASE_CURRENCY);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: (clear: boolean) => {
      const amountMinor = clear ? null : Number(parseAmountToMinor(amount.trim(), currency));
      return save({
        data: {
          planCode: plan,
          interval,
          country: country || null,
          currency: country ? currency : BASE_CURRENCY,
          amountMinor,
          reason,
        },
      });
    },
    onSuccess: (_result, clear) => {
      toast.success(clear ? "Price removed from the working set." : "Working price saved.");
      setAmount("");
      onSaved();
    },
    onError: (error) => toast.error(errorText(error, "The price could not be saved.")),
  });

  return (
    <div className="space-y-3">
      <h3 className="font-medium">Working prices</h3>
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="py-1">Plan</th>
            <th>Country</th>
            <th>Interval</th>
            <th className="text-right">Price</th>
          </tr>
        </thead>
        <tbody>
          {data.inputs.map((row) => (
            <tr
              key={`${row.planCode}-${row.country ?? "base"}-${row.interval}`}
              className="border-t"
            >
              <td className="py-1 capitalize">{row.planCode}</td>
              <td>{countryName(row.country)}</td>
              <td>{row.interval === "year" ? "Yearly" : "Monthly"}</td>
              <td className="text-right tabular-nums">{money(row.amountMinor, row.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {canEdit ? (
        <form
          className="grid gap-3 sm:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate(false);
          }}
        >
          <label className="text-sm">
            Plan
            <LookupSelect options={PLAN_OPTIONS} value={plan} onChange={setPlan} ariaLabel="Plan" />
          </label>
          <label className="text-sm">
            Country
            <LookupSelect
              options={[BASE_OPTION, ...COUNTRY_OPTIONS]}
              value={country}
              onChange={(id) => {
                setCountry(id);
                if (!id) setCurrency(BASE_CURRENCY);
              }}
              ariaLabel="Country"
            />
          </label>
          <label className="text-sm">
            Interval
            <select
              className="mt-1 flex h-9 w-full rounded-md border bg-transparent px-2"
              value={interval}
              onChange={(event) => setInterval(event.target.value === "year" ? "year" : "month")}
            >
              <option value="month">Monthly</option>
              <option value="year">Yearly</option>
            </select>
          </label>
          <label className="text-sm">
            Currency
            <LookupSelect
              options={currencyOptions}
              value={country ? currency : BASE_CURRENCY}
              onChange={setCurrency}
              disabled={!country}
              ariaLabel="Currency"
            />
          </label>
          <label className="text-sm">
            Amount ({country ? currency : BASE_CURRENCY})
            <Input
              className="mt-1"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="20.00"
            />
          </label>
          <label className="text-sm">
            Reason
            <Input
              className="mt-1"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <div className="flex gap-2 sm:col-span-3">
            <Button type="submit" disabled={mutation.isPending || !amount.trim()}>
              Save price
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate(true)}
            >
              Remove price
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function CountryRules({
  data,
  canEdit,
  currencyOptions,
  rateFor,
  onSaved,
}: {
  data: AdminData;
  canEdit: boolean;
  currencyOptions: CurrencyOption[];
  rateFor: (code: string) => AdminData["rates"][number] | null;
  onSaved: () => void;
}) {
  const save = useServerFn(saveCountryPricingRule);
  const [country, setCountry] = useState("");
  const [strategy, setStrategy] = useState<PricingStrategy>("FX_CONVERTED");
  const [currency, setCurrency] = useState("");
  const [markup, setMarkup] = useState("0");
  const [rounding, setRounding] = useState<RoundingMode>("HALF_UP");
  const [maxAge, setMaxAge] = useState("");
  const [active, setActive] = useState(true);
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          country,
          strategy,
          currency: strategy === "BASE" ? BASE_CURRENCY : currency,
          markupBps: Number(markup),
          roundingMode: rounding,
          maxRateAgeHours: maxAge.trim() ? Number(maxAge) : null,
          active,
          reason,
        },
      }),
    onSuccess: () => {
      toast.success("Country rule saved. Draft new prices to apply it.");
      onSaved();
    },
    onError: (error) => toast.error(errorText(error, "The rule could not be saved.")),
  });
  const baseInputs = data.inputs.filter((row) => row.country === null && row.interval === "month");

  function preview(rule: AdminData["rules"][number]): string {
    if (rule.strategy !== "FX_CONVERTED") return "";
    const rate = rateFor(rule.currency);
    if (!rate) return "No rate recorded";
    return baseInputs
      .map(
        (row) =>
          `${row.planCode} ${money(
            convertBasePrice({
              baseMinor: BigInt(row.amountMinor),
              targetCurrency: rule.currency,
              rate: rate.rate,
              markupBps: rule.markupBps,
              rounding: rule.roundingMode as RoundingMode,
            }),
            rule.currency,
          )}`,
      )
      .join(" · ");
  }

  return (
    <div className="space-y-3">
      <h3 className="font-medium">Country rules</h3>
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="py-1">Country</th>
            <th>Strategy</th>
            <th>Currency</th>
            <th>Markup</th>
            <th>Rounding</th>
            <th>Monthly preview</th>
          </tr>
        </thead>
        <tbody>
          {data.rules.map((rule) => (
            <tr key={rule.country} className="border-t">
              <td className="py-1">
                {countryName(rule.country)}
                {rule.active ? "" : " (paused)"}
              </td>
              <td>{rule.strategy}</td>
              <td>{rule.currency}</td>
              <td>{(rule.markupBps / 100).toFixed(2)}%</td>
              <td>{rule.roundingMode}</td>
              <td className="text-muted-foreground">{preview(rule)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {canEdit ? (
        <form
          className="grid gap-3 sm:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <label className="text-sm">
            Country
            <LookupSelect
              options={COUNTRY_OPTIONS}
              value={country}
              onChange={(id) => {
                setCountry(id);
                const existing = data.rules.find((rule) => rule.country === id);
                const fallback = ISO_COUNTRIES.find((item) => item.code === id)?.defaultCurrency;
                setCurrency(existing?.currency ?? fallback ?? "");
              }}
              ariaLabel="Country"
              required
            />
          </label>
          <label className="text-sm">
            Strategy
            <select
              className="mt-1 flex h-9 w-full rounded-md border bg-transparent px-2"
              value={strategy}
              onChange={(event) => setStrategy(event.target.value as PricingStrategy)}
            >
              {/* lookup-fixed-enum: Pricing strategy is a fixed schema enumeration. */}
              {PRICING_STRATEGIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Currency
            <LookupSelect
              options={currencyOptions}
              value={strategy === "BASE" ? BASE_CURRENCY : currency}
              onChange={setCurrency}
              disabled={strategy === "BASE"}
              ariaLabel="Currency"
            />
          </label>
          <label className="text-sm">
            Rounding
            <select
              className="mt-1 flex h-9 w-full rounded-md border bg-transparent px-2"
              value={rounding}
              onChange={(event) => setRounding(event.target.value as RoundingMode)}
            >
              {/* lookup-fixed-enum: Rounding mode is a fixed schema enumeration. */}
              {ROUNDING_MODES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Markup (basis points)
            <Input
              className="mt-1"
              inputMode="numeric"
              value={markup}
              onChange={(event) => setMarkup(event.target.value)}
            />
          </label>
          <label className="text-sm">
            Maximum rate age (hours)
            <Input
              className="mt-1"
              inputMode="numeric"
              value={maxAge}
              onChange={(event) => setMaxAge(event.target.value)}
              placeholder="No limit"
            />
          </label>
          <label className="flex items-center gap-2 self-end text-sm">
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
            />
            Active
          </label>
          <label className="text-sm">
            Reason
            <Input
              className="mt-1"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <Button type="submit" className="sm:w-fit" disabled={mutation.isPending || !country}>
            Save rule
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function ExchangeRates({
  data,
  canEdit,
  currencyOptions,
  onSaved,
}: {
  data: AdminData;
  canEdit: boolean;
  currencyOptions: CurrencyOption[];
  onSaved: () => void;
}) {
  const record = useServerFn(recordExchangeRate);
  const [currency, setCurrency] = useState("");
  const [rate, setRate] = useState("");
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      record({ data: { quoteCurrency: currency, rate: rate.trim(), effectiveAt: null, reason } }),
    onSuccess: () => {
      toast.success("Rate recorded. Draft new prices to use it.");
      setRate("");
      onSaved();
    },
    onError: (error) => toast.error(errorText(error, "The rate could not be recorded.")),
  });
  return (
    <div className="space-y-3">
      <h3 className="font-medium">Exchange rates (1 USD =)</h3>
      {data.rates.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No rates recorded. No rate provider is connected yet, so rates are entered here.
        </p>
      ) : (
        <ul className="space-y-1 text-sm">
          {data.rates.map((row) => (
            <li key={row.id}>
              {row.quote} {row.rate} · {row.source.toLowerCase()} ·{" "}
              {new Date(row.fetchedAt).toLocaleString()}
            </li>
          ))}
        </ul>
      )}
      {canEdit ? (
        <form
          className="grid gap-3 sm:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <label className="text-sm">
            Currency
            <LookupSelect
              options={currencyOptions.filter((option) => option.id !== BASE_CURRENCY)}
              value={currency}
              onChange={setCurrency}
              ariaLabel="Currency"
              required
            />
          </label>
          <label className="text-sm">
            Rate
            <Input
              className="mt-1"
              inputMode="decimal"
              value={rate}
              onChange={(event) => setRate(event.target.value)}
              placeholder="83.25"
            />
          </label>
          <label className="text-sm">
            Reason
            <Input
              className="mt-1"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <Button
            type="submit"
            className="self-end sm:w-fit"
            disabled={mutation.isPending || !currency || !rate.trim()}
          >
            Record rate
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function DraftPrices({ onSaved }: { onSaved: () => void }) {
  const draft = useServerFn(draftCountryPrices);
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: (planCode: string) => draft({ data: { planCode, reason } }),
    onSuccess: (result, planCode) => {
      toast.success(
        `${planCode} draft created with ${result.prices} prices (${result.status}). Another platform owner publishes it below.`,
      );
      onSaved();
    },
    onError: (error) => toast.error(errorText(error, "The draft could not be created.")),
  });
  return (
    <div className="space-y-3">
      <h3 className="font-medium">Draft prices for publication</h3>
      <label className="block max-w-md text-sm">
        Reason
        <Input
          className="mt-1"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        {PLAN_OPTIONS.map((plan) => (
          <Button
            key={plan.id}
            type="button"
            variant="outline"
            disabled={mutation.isPending || reason.trim().length < 3}
            onClick={() => mutation.mutate(plan.id)}
          >
            Draft {plan.label} prices
          </Button>
        ))}
      </div>
    </div>
  );
}
