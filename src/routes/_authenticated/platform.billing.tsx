import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CountryPricingAdmin } from "@/components/platform/billing/CountryPricingAdmin";
import { formatMinorAmount } from "@/lib/billing/domain/money";
import { getPlatformBilling } from "@/lib/billing/platform.functions";
import {
  publishPlanVersion,
  rollbackPlanVersion,
  savePlanVersionDraft,
} from "@/lib/billing/platform-mutations.functions";

export const Route = createFileRoute("/_authenticated/platform/billing")({
  head: () => ({ meta: [{ title: "Platform billing — LinkBooks" }] }),
  component: PlatformBillingPage,
});

function PlatformBillingPage() {
  const load = useServerFn(getPlatformBilling);
  const saveDraft = useServerFn(savePlanVersionDraft);
  const publish = useServerFn(publishPlanVersion);
  const rollback = useServerFn(rollbackPlanVersion);
  const query = useQuery({
    queryKey: ["platform-billing"],
    queryFn: () => load(),
    retry: false,
  });
  const [planCode, setPlanCode] = useState("growth");
  const [currency, setCurrency] = useState("USD");
  const [interval, setInterval] = useState("month");
  const [amount, setAmount] = useState("3000");
  const [reason, setReason] = useState("");

  if (query.isLoading) return <main className="p-6">Loading platform billing…</main>;
  if (query.isError) {
    return (
      <main className="mx-auto max-w-xl space-y-3 p-6">
        <h1 className="text-2xl font-semibold">Platform billing</h1>
        <p>{query.error instanceof Error ? query.error.message : "Access denied."}</p>
      </main>
    );
  }

  const versions = Array.isArray(query.data?.versions) ? query.data.versions : [];
  const prices = (Array.isArray(query.data?.prices) ? query.data.prices : []) as Array<{
    version_id?: string;
    country_code?: string | null;
    currency?: string;
    billing_interval?: string;
    amount_minor?: number;
  }>;
  const priceSummary = (versionId: string | undefined) =>
    prices
      .filter((price) => price.version_id === versionId)
      .map(
        (price) =>
          `${price.country_code ?? "Base"} ${formatMinorAmount(
            BigInt(price.amount_minor ?? 0),
            price.currency ?? "USD",
          )}/${price.billing_interval === "year" ? "yr" : "mo"}`,
      )
      .join(" · ");
  const owner = query.data?.role === "platform_owner";
  const editor = owner || query.data?.role === "platform_finance";
  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Platform billing</h1>
      <p className="text-sm text-muted-foreground">
        Signed in as {query.data?.role}. A published price applies to new subscribers. Existing
        subscribers keep their current version until you migrate them. Publishing asks for an active
        multi-factor authentication session. Tax collection is not enabled.
      </p>
      <CountryPricingAdmin canEdit={editor} />
      <h2 className="pt-4 text-xl font-semibold">Legacy plan prices and versions</h2>
      {editor ? (
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            saveDraft({
              data: {
                planCode,
                currency,
                interval,
                amountMinor: Number(amount),
                reason,
              },
            })
              .then((result) => {
                toast.success(
                  result.marginWarning
                    ? `Saved as ${result.status}. ${result.marginWarning}`
                    : `Saved as ${result.status}.`,
                );
                void query.refetch();
              })
              .catch((error: unknown) =>
                toast.error(
                  error instanceof Error ? error.message : "The draft could not be saved.",
                ),
              );
          }}
        >
          <label className="text-sm">
            Plan
            <select
              className="mt-1 flex h-9 w-full rounded-md border bg-transparent px-2"
              value={planCode}
              onChange={(event) => setPlanCode(event.target.value)}
            >
              <option value="starter">Starter</option>
              <option value="growth">Growth</option>
              <option value="practice">Practice</option>
            </select>
          </label>
          <label className="text-sm">
            Currency
            <select
              className="mt-1 flex h-9 w-full rounded-md border bg-transparent px-2"
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
            >
              {/* lookup-fixed-enum: Short schema or presentation enumeration, not selectable business records. */}

              {["USD", "GBP", "AUD", "NZD", "INR"].map((code) => (
                <option key={code}>{code}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Interval
            <select
              className="mt-1 flex h-9 w-full rounded-md border bg-transparent px-2"
              value={interval}
              onChange={(event) => setInterval(event.target.value)}
            >
              <option value="month">Monthly</option>
              <option value="year">Yearly</option>
            </select>
          </label>
          <label className="text-sm">
            Amount in minor units
            <Input
              className="mt-1"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <label className="text-sm sm:col-span-2">
            Reason
            <Input
              className="mt-1"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <Button type="submit" className="sm:col-span-2 sm:w-fit">
            Save draft
          </Button>
        </form>
      ) : null}
      <ul className="space-y-2 text-sm">
        {versions.map((row) => {
          const version = row as {
            id?: string;
            plan_code?: string;
            status?: string;
            version_no?: number;
          };
          return (
            <li
              key={version.id ?? `${version.plan_code}-${version.version_no}`}
              className="flex flex-wrap items-center gap-2"
            >
              <span>
                {version.plan_code} version {version.version_no} · {version.status}
                {priceSummary(version.id) ? (
                  <span className="block text-xs text-muted-foreground">
                    {priceSummary(version.id)}
                  </span>
                ) : null}
              </span>
              {owner &&
              version.id &&
              (version.status === "draft" || version.status === "review") ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    publish({ data: { versionId: version.id ?? "", reason } })
                      .then(() => {
                        toast.success(
                          "Published. Existing subscribers stay on their current price.",
                        );
                        void query.refetch();
                      })
                      .catch((error: unknown) =>
                        toast.error(error instanceof Error ? error.message : "Publish failed."),
                      )
                  }
                >
                  Publish
                </Button>
              ) : null}
              {owner && version.plan_code && version.status === "published" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    rollback({ data: { planCode: version.plan_code ?? "", reason } })
                      .then(() => {
                        toast.success("The previous version is published again.");
                        void query.refetch();
                      })
                      .catch((error: unknown) =>
                        toast.error(error instanceof Error ? error.message : "Rollback failed."),
                      )
                  }
                >
                  Roll back
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
