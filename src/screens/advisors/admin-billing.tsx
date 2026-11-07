import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdvisorsSubnav } from "@/components/advisors/AdvisorsSubnav";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getAdvisorsBillingBoard,
  linkAdvisorsClientCompany,
  markAdvisorsManualBilling,
  prepareAdvisorsSubscription,
  startAdvisorsSubscriptionCheckout,
  syncAdvisorsSubscription,
} from "@/lib/advisors/billing.functions";
import { formatAdvisorsMoney } from "@/lib/advisors/engagements";
import { friendlyAuthError } from "@/lib/auth-helpers";

export function AdvisorsAdminBillingPage() {
  const qc = useQueryClient();
  const load = useServerFn(getAdvisorsBillingBoard);
  const linkCompany = useServerFn(linkAdvisorsClientCompany);
  const prepare = useServerFn(prepareAdvisorsSubscription);
  const startCheckout = useServerFn(startAdvisorsSubscriptionCheckout);
  const sync = useServerFn(syncAdvisorsSubscription);
  const markManual = useServerFn(markAdvisorsManualBilling);

  const [reason, setReason] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [selectedEngagementId, setSelectedEngagementId] = useState<string | null>(null);
  const [billing, setBilling] = useState({
    email: "",
    firstName: "",
    lastName: "",
    company: "",
    line1: "",
    city: "",
    state: "",
    postalCode: "",
    country: "US",
  });

  const query = useQuery({
    queryKey: ["advisors-billing"],
    queryFn: () => load({ data: {} }),
    retry: false,
  });

  const selected =
    query.data?.eligibleEngagements.find((item) => item.id === selectedEngagementId) ?? null;
  const selectedSub =
    query.data?.subscriptions.find((item) => item.engagementId === selectedEngagementId) ?? null;

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ["advisors-billing"] });
    await qc.invalidateQueries({ queryKey: ["advisors-overview"] });
  };

  const linkM = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("Select an engagement first");
      return linkCompany({
        data: {
          clientId: selected.clientId,
          companyId,
          reason: reason || "Linked Advisors client to billing company",
        },
      });
    },
    onSuccess: async () => {
      toast.success("Client linked to company");
      setReason("");
      await invalidate();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const prepareM = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("Select an engagement first");
      return prepare({
        data: {
          engagementId: selected.id,
          interval: "month",
          reason: reason || "Prepared Advisors subscription for checkout",
        },
      });
    },
    onSuccess: async () => {
      toast.success("Subscription prepared (not charged)");
      setReason("");
      await invalidate();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const checkoutM = useMutation({
    mutationFn: async () => {
      if (!selectedSub) throw new Error("Prepare a subscription first");
      return startCheckout({
        data: {
          subscriptionId: selectedSub.id,
          companyId: selectedSub.companyId,
          planCode: selectedSub.billingPlanCode,
          interval: selectedSub.billingInterval,
          method: "card",
          origin: window.location.origin,
          reason: reason || "Opened Advisors billing checkout",
          billing: {
            email: billing.email,
            firstName: billing.firstName,
            lastName: billing.lastName,
            company: billing.company || undefined,
            line1: billing.line1,
            city: billing.city,
            state: billing.state || undefined,
            postalCode: billing.postalCode || undefined,
            country: billing.country,
          },
        },
      });
    },
    onSuccess: async (result) => {
      toast.success("Checkout opened via existing billing engine");
      setReason("");
      await invalidate();
      if (result?.url) window.location.href = result.url;
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const syncM = useMutation({
    mutationFn: (subscriptionId: string) => sync({ data: { subscriptionId } }),
    onSuccess: async () => {
      toast.success("Synced from company subscription");
      await invalidate();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const manualM = useMutation({
    mutationFn: (input: { subscriptionId: string; active: boolean }) =>
      markManual({
        data: {
          subscriptionId: input.subscriptionId,
          active: input.active,
          reason:
            reason ||
            (input.active
              ? "Marked manual Advisors billing active"
              : "Cleared manual Advisors billing"),
        },
      }),
    onSuccess: async () => {
      toast.success("Manual billing marker updated (no provider charge invented)");
      setReason("");
      await invalidate();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (query.isPending) return <LoadingState />;
  if (query.isError) {
    return (
      <main className="mx-auto max-w-6xl space-y-6 p-6">
        <ListWorkspace title="Billing" description="Advisors subscriptions via LinkBooks billing.">
        <ErrorState
          title="Advisors billing unavailable"
          description={friendlyAuthError(query.error)}
          onRetry={() => void query.refetch()}
        />
          </ListWorkspace>
  </main>
    );
  }

  const board = query.data;

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <ListWorkspace
        title="Billing"
        description="Map Advisors plans to existing billing SKUs, prepare checkout on a dedicated company, and sync provider status. Proposal/agreement acceptance never starts payment."
       subnav={<AdvisorsSubnav />}>

      <div className="space-y-1">
        <Label htmlFor="billing-reason">Change reason</Label>
        <Input
          id="billing-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Why are you changing Advisors billing?"
          className="max-w-xl"
        />
      </div>

      <section className="space-y-3 rounded-xl border border-border/70 p-4">
        <h2 className="font-semibold">SKU map (existing billing_plans)</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {board.skuMap.map((sku) => (
            <article
              key={sku.advisorsPlanCode}
              className="rounded-lg border border-border/50 p-3 text-sm"
            >
              <p className="font-medium">{sku.planName}</p>
              <p className="text-muted-foreground">
                {sku.advisorsPlanCode} → {sku.billingPlanCode}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatAdvisorsMoney(sku.monthlyUsd, "USD")} / {sku.defaultInterval}
                {sku.isRecurring ? "" : " · pack SKU"}
              </p>
            </article>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <section className="space-y-2">
          <h2 className="font-semibold">Eligible engagements</h2>
          {board.eligibleEngagements.length === 0 ? (
            <EmptyState
              title="No billable engagements"
              description="Accept a proposal/agreement first. Billing still requires an explicit prepare + checkout step."
            />
          ) : (
            board.eligibleEngagements.map((engagement) => (
              <button
                key={engagement.id}
                type="button"
                onClick={() => {
                  setSelectedEngagementId(engagement.id);
                  setBilling((prev) => ({
                    ...prev,
                    email: engagement.clientEmail || prev.email,
                    company: engagement.clientName || prev.company,
                  }));
                }}
                className={`w-full rounded-xl border p-4 text-left transition ${
                  selectedEngagementId === engagement.id
                    ? "border-primary bg-primary/5"
                    : "border-border/70 hover:border-primary/40"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{engagement.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {engagement.clientName || engagement.clientEmail}
                    </p>
                  </div>
                  <Badge variant="secondary">{engagement.status}</Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {engagement.planCode || "no plan"} ·{" "}
                  {formatAdvisorsMoney(engagement.amountMinor, engagement.currency)} · company{" "}
                  {engagement.companyId ? "linked" : "missing"}
                  {engagement.hasSubscription ? " · subscription prepared" : ""}
                </p>
              </button>
            ))
          )}
        </section>

        <section className="space-y-4 rounded-xl border border-border/70 p-4">
          {!selected ? (
            <EmptyState
              title="Select an engagement"
              description="Link a dedicated billing company, prepare the Advisors SKU, then open checkout."
            />
          ) : (
            <>
              <div>
                <h2 className="font-semibold">{selected.title}</h2>
                <p className="text-sm text-muted-foreground">
                  {selected.clientEmail} · {selected.planCode || "no plan code"}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="company-id">Dedicated billing company ID</Label>
                <Input
                  id="company-id"
                  value={companyId || selected.companyId || ""}
                  onChange={(event) => setCompanyId(event.target.value)}
                  placeholder="uuid of Advisors billing shell company"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={linkM.isPending || !(companyId || selected.companyId)}
                  onClick={() => {
                    if (!companyId && selected.companyId) setCompanyId(selected.companyId);
                    linkM.mutate();
                  }}
                >
                  Link client to company
                </Button>
              </div>

              <Button type="button" disabled={prepareM.isPending} onClick={() => prepareM.mutate()}>
                Prepare subscription (no charge)
              </Button>

              {selectedSub ? (
                <div className="space-y-3 rounded-lg border border-border/50 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">
                      {selectedSub.billingPlanCode} · {selectedSub.billingInterval}
                    </p>
                    <Badge variant="outline">{selectedSub.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Company sub: {selectedSub.companySubscriptionStatus || "none"} ·{" "}
                    {selectedSub.companyPlanCode || "—"}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      placeholder="Billing email"
                      value={billing.email}
                      onChange={(event) =>
                        setBilling((prev) => ({ ...prev, email: event.target.value }))
                      }
                    />
                    <Input
                      placeholder="Country (US)"
                      value={billing.country}
                      onChange={(event) =>
                        setBilling((prev) => ({
                          ...prev,
                          country: event.target.value.toUpperCase(),
                        }))
                      }
                    />
                    <Input
                      placeholder="First name"
                      value={billing.firstName}
                      onChange={(event) =>
                        setBilling((prev) => ({ ...prev, firstName: event.target.value }))
                      }
                    />
                    <Input
                      placeholder="Last name"
                      value={billing.lastName}
                      onChange={(event) =>
                        setBilling((prev) => ({ ...prev, lastName: event.target.value }))
                      }
                    />
                    <Input
                      className="sm:col-span-2"
                      placeholder="Address line"
                      value={billing.line1}
                      onChange={(event) =>
                        setBilling((prev) => ({ ...prev, line1: event.target.value }))
                      }
                    />
                    <Input
                      placeholder="City"
                      value={billing.city}
                      onChange={(event) =>
                        setBilling((prev) => ({ ...prev, city: event.target.value }))
                      }
                    />
                    <Input
                      placeholder="Postal code"
                      value={billing.postalCode}
                      onChange={(event) =>
                        setBilling((prev) => ({ ...prev, postalCode: event.target.value }))
                      }
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      disabled={checkoutM.isPending}
                      onClick={() => checkoutM.mutate()}
                    >
                      Open provider checkout
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={syncM.isPending}
                      onClick={() => syncM.mutate(selectedSub.id)}
                    >
                      Sync status
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={manualM.isPending}
                      onClick={() =>
                        manualM.mutate({ subscriptionId: selectedSub.id, active: true })
                      }
                    >
                      Mark manual active
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Checkout requires company `billing.manage` on the linked organisation. Use a
                    dedicated Advisors billing company so SaaS subscriptions are not overwritten.
                  </p>
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>

      <section className="space-y-2">
        <h2 className="font-semibold">Advisors subscriptions</h2>
        {board.subscriptions.length === 0 ? (
          <EmptyState
            title="No Advisors subscriptions yet"
            description="Prepared and active Advisors billings appear here."
          />
        ) : (
          board.subscriptions.map((subscription) => (
            <article
              key={subscription.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 p-4 text-sm"
            >
              <div>
                <p className="font-medium">
                  {subscription.engagementTitle || subscription.engagementId}
                </p>
                <p className="text-muted-foreground">
                  {subscription.clientEmail} · {subscription.billingPlanCode} ·{" "}
                  {formatAdvisorsMoney(subscription.amountMinor, subscription.currency)}
                </p>
              </div>
              <Badge variant="secondary">{subscription.status}</Badge>
            </article>
          ))
        )}
      </section>
        </ListWorkspace>
  </main>
  );
}
