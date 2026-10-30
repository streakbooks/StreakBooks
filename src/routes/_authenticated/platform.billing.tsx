import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { bootstrapPlatformOwner, getPlatformBilling } from "@/lib/billing/platform.functions";
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
  const bootstrap = useServerFn(bootstrapPlatformOwner);
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
  const [password, setPassword] = useState("");

  if (query.isLoading) return <main className="p-6">Loading platform billing…</main>;
  if (query.isError) {
    return (
      <main className="mx-auto max-w-xl space-y-3 p-6">
        <h1 className="text-2xl font-semibold">Platform billing</h1>
        <p>{query.error instanceof Error ? query.error.message : "Access denied."}</p>
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            bootstrap()
              .then(() => {
                toast.success("Platform owner recorded.");
                void query.refetch();
              })
              .catch((error: unknown) =>
                toast.error(error instanceof Error ? error.message : "Bootstrap failed."),
              )
          }
        >
          Bootstrap platform owner
        </Button>
      </main>
    );
  }

  const versions = Array.isArray(query.data?.versions) ? query.data.versions : [];
  const owner = query.data?.role === "platform_owner";
  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Platform billing</h1>
      <p className="text-sm text-muted-foreground">
        Signed in as {query.data?.role}. A published price applies to new subscribers. Existing
        subscribers keep their current version until you migrate them. Publishing asks for
        multi-factor authentication or your password. Tax collection is not enabled.
      </p>
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
              toast.error(error instanceof Error ? error.message : "The draft could not be saved."),
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
            <option value="pro">Pro</option>
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
        {owner ? (
          <label className="text-sm sm:col-span-2">
            Password, if multi-factor authentication is not active
            <Input
              className="mt-1"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
        ) : null}
        <Button type="submit" className="sm:col-span-2 sm:w-fit">
          Save draft
        </Button>
      </form>
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
              </span>
              {owner &&
              version.id &&
              (version.status === "draft" || version.status === "review") ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    publish({ data: { versionId: version.id ?? "", reason, password } })
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
                    rollback({ data: { planCode: version.plan_code ?? "", reason, password } })
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
