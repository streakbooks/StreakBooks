import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { LookupSelect } from "@/components/lookup";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getPaymentSettings,
  requeueWebhookEvent,
  setCountryBilling,
  setProviderRoute,
  type PaymentSettings,
} from "@/lib/billing/payment-admin.functions";
import { ISO_COUNTRIES } from "@/lib/billing/reference/iso-reference-data";

const queryKey = ["platform-payment-settings"] as const;
const COUNTRY_OPTIONS = ISO_COUNTRIES.map((item) => ({
  id: item.code,
  label: item.name,
  code: item.code,
}));
const DEFAULT_OPTION = { id: "", label: "Default (all other countries)" };

function countryName(code: string | null): string {
  if (!code) return "Default";
  return ISO_COUNTRIES.find((item) => item.code === code)?.name ?? code;
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error || typeof error === "string" ? friendlyAuthError(error) : fallback;
}

export function PaymentOperationsAdmin({
  canEdit,
  isOwner,
}: {
  canEdit: boolean;
  isOwner: boolean;
}) {
  const load = useServerFn(getPaymentSettings);
  const query = useQuery({ queryKey, queryFn: () => load(), retry: false });
  return (
    <section className="space-y-6" aria-labelledby="payments-heading">
      <header className="space-y-1">
        <h2 id="payments-heading" className="text-xl font-semibold">
          Payments
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Providers run in test mode unless the server allows live keys. A country takes paid
          checkouts only after it is opened here, once provider eligibility and tax registration are
          confirmed outside LinkBooks.
        </p>
      </header>
      {query.isLoading ? <p className="text-sm">Loading payment settings…</p> : null}
      {query.isError ? (
        <QueryErrorState queries={[query]} title="Could not load payment settings" />
      ) : null}
      {query.data ? (
        <>
          <Routes data={query.data} canEdit={canEdit} />
          <Countries data={query.data} canEdit={canEdit && isOwner} />
          <Webhooks data={query.data} canEdit={canEdit} />
        </>
      ) : null}
    </section>
  );
}

function useRefresh() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey });
}

function Routes({ data, canEdit }: { data: PaymentSettings; canEdit: boolean }) {
  const save = useServerFn(setProviderRoute);
  const refresh = useRefresh();
  const [country, setCountry] = useState("");
  const [provider, setProvider] = useState<"stripe" | "razorpay">("stripe");
  const [priority, setPriority] = useState("100");
  const [enabled, setEnabled] = useState(true);
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: { country: country || null, provider, enabled, priority: Number(priority), reason },
      }),
    onSuccess: () => {
      toast.success("Route saved.");
      refresh();
    },
    onError: (error) => toast.error(errorText(error, "The route could not be saved.")),
  });
  return (
    <div className="space-y-3">
      <h3 className="font-medium">Provider routes</h3>
      <ul className="space-y-1 text-sm">
        {data.routes.map((route) => (
          <li key={route.id}>
            {countryName(route.country)} → {route.provider} · priority {route.priority}
            {route.enabled ? "" : " · disabled"}
          </li>
        ))}
      </ul>
      {canEdit ? (
        <form
          className="grid gap-3 sm:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <label className="text-sm">
            Country
            <LookupSelect
              options={[DEFAULT_OPTION, ...COUNTRY_OPTIONS]}
              value={country}
              onChange={setCountry}
              ariaLabel="Country"
            />
          </label>
          <label className="text-sm">
            Provider
            <select
              className="mt-1 flex h-9 w-full rounded-md border bg-transparent px-2"
              value={provider}
              onChange={(event) =>
                setProvider(event.target.value === "razorpay" ? "razorpay" : "stripe")
              }
            >
              <option value="stripe">Stripe</option>
              <option value="razorpay">Razorpay</option>
            </select>
          </label>
          <label className="text-sm">
            Priority (lower first)
            <Input
              className="mt-1"
              inputMode="numeric"
              value={priority}
              onChange={(event) => setPriority(event.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 self-end text-sm">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
            />
            Enabled
          </label>
          <label className="text-sm">
            Reason
            <Input
              className="mt-1"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <Button type="submit" className="self-end sm:w-fit" disabled={mutation.isPending}>
            Save route
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function Countries({ data, canEdit }: { data: PaymentSettings; canEdit: boolean }) {
  const save = useServerFn(setCountryBilling);
  const refresh = useRefresh();
  const [country, setCountry] = useState("");
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: (enabled: boolean) => save({ data: { country, enabled, reason } }),
    onSuccess: (_result, enabled) => {
      toast.success(
        enabled ? "Country opened for paid checkout." : "Country closed for paid checkout.",
      );
      refresh();
    },
    onError: (error) => toast.error(errorText(error, "The country could not be updated.")),
  });
  const open = new Set(data.billingCountries);
  return (
    <div className="space-y-3">
      <h3 className="font-medium">Countries open for paid checkout</h3>
      <p className="text-sm">
        {data.billingCountries.length
          ? data.billingCountries.map((code) => countryName(code)).join(", ")
          : "None. Trials work everywhere; paid checkout is closed."}
      </p>
      {canEdit ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm">
            Country
            <LookupSelect
              options={COUNTRY_OPTIONS}
              value={country}
              onChange={setCountry}
              ariaLabel="Country"
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
          <div className="flex items-end gap-2">
            <Button
              type="button"
              disabled={mutation.isPending || !country || open.has(country)}
              onClick={() => mutation.mutate(true)}
            >
              Open
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending || !country || !open.has(country)}
              onClick={() => mutation.mutate(false)}
            >
              Close
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Only a platform owner can open or close a country.
        </p>
      )}
    </div>
  );
}

function Webhooks({ data, canEdit }: { data: PaymentSettings; canEdit: boolean }) {
  const requeue = useServerFn(requeueWebhookEvent);
  const refresh = useRefresh();
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: (id: string) => requeue({ data: { id, reason } }),
    onSuccess: () => {
      toast.success("Queued for another attempt.");
      refresh();
    },
    onError: (error) => toast.error(errorText(error, "The event could not be queued.")),
  });
  const counts = Object.entries(data.webhookCounts)
    .map(([status, count]) => `${status} ${count}`)
    .join(" · ");
  return (
    <div className="space-y-3">
      <h3 className="font-medium">Provider events</h3>
      <p className="text-sm text-muted-foreground">{counts || "No events received yet."}</p>
      {canEdit ? (
        <label className="block max-w-md text-sm">
          Reason for retrying
          <Input
            className="mt-1"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
      ) : null}
      <ul className="space-y-1 text-sm">
        {data.webhooks.map((event) => (
          <li key={event.id} className="flex flex-wrap items-center gap-2">
            <Badge
              variant={
                event.status === "processed"
                  ? "success"
                  : event.status === "dead"
                    ? "warning"
                    : "secondary"
              }
            >
              {event.status}
            </Badge>
            <span>
              {event.provider} · {event.eventType} · {event.mode ?? "?"} · attempts {event.attempts}
            </span>
            <time className="text-muted-foreground" dateTime={event.receivedAt}>
              {new Date(event.receivedAt).toLocaleString()}
            </time>
            {event.lastError ? <span className="text-destructive">{event.lastError}</span> : null}
            {canEdit && (event.status === "failed" || event.status === "dead") ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={mutation.isPending || reason.trim().length < 3}
                onClick={() => mutation.mutate(event.id)}
              >
                Retry
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
