import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;
import {
  mayActivateStripeCheckout,
  stripeCheckoutId,
  stripeSubscriptionState,
  str,
  obj,
} from "@/lib/billing/providers/normalise";

export type ConfirmCheckoutResult =
  | { status: "applied"; planCode: string; subscriptionStatus: string }
  | { status: "already_active"; planCode: string; subscriptionStatus: string }
  | { status: "pending"; reason: string }
  | { status: "skipped"; reason: string };

function subscriptionSuccessUrl(origin: string): string {
  return `${origin}/settings?section=subscription&checkout=success&session_id={CHECKOUT_SESSION_ID}`;
}

export { subscriptionSuccessUrl };

async function rpcApplyCheckout(
  checkoutId: string,
  session: Record<string, unknown>,
  subscription: Record<string, unknown>,
): Promise<ConfirmCheckoutResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const state = stripeSubscriptionState(subscription);
  if (!state || state.ended || (state.status !== "active" && state.status !== "trialing")) {
    return { status: "pending", reason: "Subscription is not active yet." };
  }
  const paymentStatus = str(session["payment_status"]);
  const subscriptionStatus = str(subscription["status"]);
  if (!mayActivateStripeCheckout(paymentStatus, subscriptionStatus)) {
    return { status: "pending", reason: "Payment is still processing." };
  }
  const subscriptionId = str(session["subscription"]) ?? str(subscription["id"]);
  if (!subscriptionId) return { status: "skipped", reason: "Missing subscription id." };
  const eventId = `confirm_${str(session["id"]) ?? checkoutId}`;
  const { data, error } = await supabaseAdmin.rpc("billing_apply_provider_event" as never, {
    _provider: "stripe",
    _event_id: eventId,
    _kind: "checkout_completed",
    _data: {
      checkoutId,
      subscriptionId,
      customerId: str(session["customer"]),
      status: state.status,
      periodEnd: state.periodEnd,
      cancelAtPeriodEnd: state.cancelAtPeriodEnd,
      occurredAt: new Date().toISOString(),
    },
  } as never);
  if (error) throw new Error(error.message);
  const result = data as { result?: string; reason?: string };
  if (result.result === "applied") {
    const { error: redeemError } = await supabaseAdmin.rpc("billing_redeem_coupon" as never, {
      _checkout_id: checkoutId,
    } as never);
    if (redeemError) throw new Error(redeemError.message);
    return {
      status: "applied",
      planCode: str(obj(session["metadata"])["plan_code"]) ?? "",
      subscriptionStatus: state.status,
    };
  }
  if (result.reason === "checkout already completed") {
    const sub = await loadPaidSubscription(supabaseAdmin as unknown as Client, checkoutId);
    if (sub) {
      return {
        status: "already_active",
        planCode: sub.plan_code,
        subscriptionStatus: sub.status,
      };
    }
    return { status: "already_active", planCode: "", subscriptionStatus: state.status };
  }
  return { status: "skipped", reason: result.reason ?? "Could not activate subscription." };
}

async function loadPaidSubscription(
  supabase: Client,
  checkoutId: string,
): Promise<{ plan_code: string; status: string } | null> {
  const { data: chk } = await supabase
    .from("billing_checkouts" as never)
    .select("company_id" as never)
    .eq("id" as never, checkoutId as never)
    .maybeSingle();
  if (!chk) return null;
  const companyId = (chk as { company_id: string }).company_id;
  const { data: sub } = await supabase
    .from("company_subscriptions" as never)
    .select("plan_code, status" as never)
    .eq("company_id" as never, companyId as never)
    .maybeSingle();
  return sub as { plan_code: string; status: string } | null;
}

/** Confirms a Stripe Checkout session after redirect (webhook fallback for local/slow delivery). */
export async function confirmStripeCheckoutSession(input: {
  companyId: string;
  sessionId: string;
}): Promise<ConfirmCheckoutResult> {
  const { createStripeClient } = await import("@/lib/billing/providers/stripe.server");
  const stripe = createStripeClient();
  const session = await stripe.request(
    "GET",
    `checkout/sessions/${encodeURIComponent(input.sessionId)}`,
    undefined,
  );
  const checkoutId = stripeCheckoutId(session);
  if (!checkoutId) {
    return { status: "skipped", reason: "Checkout session is not linked to StreakBooks." };
  }
  const metaCompany = str(obj(session["metadata"])["company_id"]);
  if (metaCompany && metaCompany !== input.companyId) {
    return { status: "skipped", reason: "This payment belongs to another organisation." };
  }
  const subscriptionId = str(session["subscription"]);
  if (!subscriptionId) {
    return { status: "pending", reason: "Checkout has no subscription yet." };
  }
  const subscription = await stripe.request(
    "GET",
    `subscriptions/${encodeURIComponent(subscriptionId)}`,
  );
  return rpcApplyCheckout(checkoutId, session, subscription);
}

/** Expire stale open checkouts so customers are not blocked forever. */
export async function expireStaleOpenCheckouts(companyId: string, maxAgeHours = 2): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000).toISOString();
  const { error } = await supabaseAdmin
    .from("billing_checkouts" as never)
    .update({ status: "expired" } as never)
    .eq("company_id" as never, companyId as never)
    .eq("status" as never, "open" as never)
    .lt("created_at" as never, cutoff as never);
  if (error) throw new Error(error.message);
}

/** Block a second checkout while a recent one is still open (unless it was expired above). */
export async function assertNoRecentOpenCheckout(supabase: Client, companyId: string): Promise<void> {
  const { data, error } = await supabase
    .from("billing_checkouts" as never)
    .select("id, created_at" as never)
    .eq("company_id" as never, companyId as never)
    .eq("status" as never, "open" as never)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return;
  const row = data as { id: string; created_at: string };
  const ageMs = Date.now() - new Date(row.created_at).getTime();
  if (ageMs < 15 * 60 * 1000) {
    throw new Error(
      "A checkout is already in progress for this organisation. Finish payment on Stripe or wait about 15 minutes before starting again.",
    );
  }
}