import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertUuid } from "@/lib/company-validation";
import { assertPriceFloor, stripeRefundBody } from "@/lib/billing/provider-actions";
import { isBillingCurrency, isPlanCode } from "@/lib/billing/pricing";
import { assertRefundPayment } from "@/lib/billing/refund-policy";
import { assertStripeTestKey } from "@/lib/billing/provider-keys";

export const savePlanVersionDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      planCode: string;
      currency: string;
      interval: string;
      amountMinor: number;
      reason: string;
    }) => {
      if (
        !isPlanCode(input?.planCode) ||
        !isBillingCurrency(input?.currency) ||
        !["month", "year"].includes(input?.interval)
      )
        throw new Error("Choose a supported plan, currency and interval.");
      assertPriceFloor(input.currency, input.interval as "month" | "year", input.amountMinor);
      return input;
    },
  )
  .handler(async ({ context, data }) => {
    const { data: result, error } = await context.supabase.rpc(
      "platform_price_action" as never,
      { _action: "draft", _payload: data, _reason: data.reason } as never,
    );
    if (error) throw new Error(error.message);
    return result as { versionId: string; status: string; marginWarning: string | null };
  });
export const publishPlanVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { versionId: string; reason: string; password?: string }) => ({
    versionId: assertUuid(input?.versionId),
    reason: input?.reason ?? "",
  }))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.rpc(
      "platform_price_action" as never,
      { _action: "publish", _payload: data, _reason: data.reason } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true as const, grandfathered: true as const };
  });
export const rollbackPlanVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { planCode: string; reason: string; password?: string }) => {
    if (!isPlanCode(input?.planCode)) throw new Error("Choose a plan.");
    return { planCode: input.planCode, reason: input.reason };
  })
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.rpc(
      "platform_price_action" as never,
      { _action: "rollback", _payload: data, _reason: data.reason } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const refundBillingPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { companyId: string; paymentIntent: string; amountMinor: number; reason: string }) => {
      const amountMinor = Math.round(Number(input?.amountMinor));
      const paymentIntent = (input?.paymentIntent ?? "").trim();
      const reason = (input?.reason ?? "").trim();
      if (!paymentIntent.startsWith("pi_")) throw new Error("Enter the Stripe payment intent.");
      if (!Number.isInteger(amountMinor) || amountMinor < 1)
        throw new Error("Enter a refund amount.");
      if (reason.length < 3) throw new Error("Record a reason for the refund.");
      return { companyId: assertUuid(input?.companyId), paymentIntent, amountMinor, reason };
    },
  )
  .handler(async ({ data, context }) => {
    const { data: role, error: roleError } = await context.supabase.rpc("platform_role" as never);
    if (roleError || (role !== "platform_owner" && role !== "platform_finance"))
      throw new Error("An active billing staff MFA session is required.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: subscription, error } = await supabaseAdmin
      .from("company_subscriptions" as never)
      .select("unit_amount_minor, provider_customer_id, currency" as never)
      .eq("company_id" as never, data.companyId as never)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const customer = subscription as {
      provider_customer_id: string | null;
      currency: string;
    } | null;
    if (!customer?.provider_customer_id)
      throw new Error("This business has no verified billing customer.");
    const secret = process.env["STRIPE_SECRET_KEY"];
    if (!secret) throw new Error("Stripe is not configured.");
    assertStripeTestKey(secret);
    const intentResponse = await fetch(
      `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(data.paymentIntent)}`,
      { headers: { Authorization: `Bearer ${secret}` } },
    );
    const intent = (await intentResponse.json()) as {
      customer?: string;
      currency?: string;
      status?: string;
      amount_received?: number;
    };
    if (!intentResponse.ok) throw new Error("The payment could not be verified with Stripe.");
    assertRefundPayment(
      intent,
      { provider_customer_id: customer.provider_customer_id, currency: customer.currency },
      data.amountMinor,
    );
    const { createHash } = await import("node:crypto");
    const idempotencyKey = createHash("sha256")
      .update(JSON.stringify([data.companyId, data.paymentIntent, data.amountMinor, data.reason]))
      .digest("hex");
    const { error: requestAuditError } = await supabaseAdmin
      .from("platform_billing_audit" as never)
      .insert({
        actor_user_id: context.userId,
        action: "refund_requested",
        entity_type: "billing_payment",
        entity_id: data.companyId,
        before_state: {},
        after_state: { amountMinor: data.amountMinor, idempotencyKey },
        reason: data.reason,
      } as never);
    if (requestAuditError) throw new Error(requestAuditError.message);
    const response = await fetch("https://api.stripe.com/v1/refunds", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": idempotencyKey,
      },
      body: stripeRefundBody(data.paymentIntent, data.amountMinor, data.reason),
    });
    const payload = (await response.json()) as { id?: string; error?: { message?: string } };
    if (!response.ok || !payload.id)
      throw new Error(payload.error?.message ?? "Stripe could not refund that payment.");
    const { error: auditError } = await supabaseAdmin
      .from("platform_billing_audit" as never)
      .insert({
        actor_user_id: context.userId,
        action: "refund_provider_accepted",
        entity_type: "billing_payment",
        entity_id: data.companyId,
        before_state: {},
        after_state: { refundId: payload.id, amountMinor: data.amountMinor, idempotencyKey },
        reason: data.reason,
      } as never);
    if (auditError)
      throw new Error(
        "Provider accepted the refund, but audit confirmation failed. Reconcile using the payment provider before retrying.",
      );
    return { refundId: payload.id };
  });
