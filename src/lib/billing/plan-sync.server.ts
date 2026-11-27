import { stripeStateEvent } from "@/lib/billing/providers/normalise";

/** Pulls the current Stripe subscription into the ledger (webhook fallback after plan changes). */
export async function syncStripeSubscriptionState(
  companyId: string,
  subscriptionId: string,
  subscription?: Record<string, unknown>,
): Promise<{ synced: boolean; reason?: string }> {
  const { createStripeClient } = await import("@/lib/billing/providers/stripe.server");
  const stripe = createStripeClient();
  const sub =
    subscription ??
    (await stripe.request("GET", `subscriptions/${encodeURIComponent(subscriptionId)}`));
  const event = stripeStateEvent(subscriptionId, sub, new Date().toISOString());
  if (!event || event.kind !== "subscription_state") {
    return { synced: false, reason: "Stripe returned no subscription state." };
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: row } = await supabaseAdmin
    .from("company_subscriptions" as never)
    .select("company_id" as never)
    .eq("company_id" as never, companyId as never)
    .maybeSingle();
  if (!row) return { synced: false, reason: "No subscription on file." };
  const eventId = `sync_plan_${subscriptionId}_${Date.now()}`;
  const { data, error } = await supabaseAdmin.rpc(
    "billing_apply_provider_event" as never,
    {
      _provider: "stripe",
      _event_id: eventId,
      _kind: event.kind,
      _data: event.data,
    } as never,
  );
  if (error) throw new Error(error.message);
  const result = data as { result?: string; reason?: string };
  if (result.result === "applied" || result.result === "skipped") {
    return result.reason
      ? { synced: result.result === "applied", reason: result.reason }
      : { synced: result.result === "applied" };
  }
  return { synced: false, reason: result.reason ?? "Sync did not apply." };
}
