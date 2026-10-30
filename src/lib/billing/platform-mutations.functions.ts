import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertUuid } from "@/lib/company-validation";
import { isBillingCurrency, isPlanCode } from "@/lib/billing/pricing";
import { planMargin } from "@/lib/billing/margin";
import { assertPriceFloor, stripeRefundBody } from "@/lib/billing/provider-actions";
import { assertStripeTestKey } from "@/lib/billing/provider-keys";
import { canRefund } from "@/lib/billing/platform-access";

type Role = "platform_owner" | "platform_finance" | "platform_support";

function asRole(value: unknown): Role | null {
  return value === "platform_owner" || value === "platform_finance" || value === "platform_support"
    ? value
    : null;
}

async function roleOf(supabase: {
  rpc: (fn: "platform_role") => PromiseLike<{ data: unknown; error: { message: string } | null }>;
}): Promise<Role> {
  const { data, error } = await supabase.rpc("platform_role");
  if (error) throw new Error(error.message);
  const role = asRole(data);
  if (!role)
    throw new Error(
      "This console is limited to platform staff. Organisation admins cannot open it.",
    );
  return role;
}

async function confirmSensitiveChange(
  claims: { aal?: unknown; email?: unknown },
  password: string,
): Promise<void> {
  if (claims.aal === "aal2") return;
  const email = typeof claims.email === "string" ? claims.email : "";
  if (!password || !email) {
    throw new Error(
      "Finish multi-factor authentication, or confirm your password, before changing a price.",
    );
  }
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("Supabase is not configured.");
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  await client.auth.signOut();
  if (error) throw new Error("Password confirmation failed.");
}

async function audit(
  action: string,
  entityId: string,
  before: unknown,
  after: unknown,
  reason: string,
  actor: string,
): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("platform_billing_audit" as never).insert({
    actor_user_id: actor,
    action,
    entity_type: "plan_version",
    entity_id: entityId,
    before_state: before ?? {},
    after_state: after ?? {},
    reason,
  } as never);
  if (error) throw new Error(error.message);
}

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
      if (!isPlanCode(input?.planCode) || !isBillingCurrency(input?.currency)) {
        throw new Error("Choose a plan and a supported currency.");
      }
      const interval = input?.interval === "year" ? "year" : "month";
      const amountMinor = Math.round(Number(input?.amountMinor));
      assertPriceFloor(input.currency, interval, amountMinor);
      const reason = (input?.reason ?? "").trim();
      if (reason.length < 3) throw new Error("Record a reason for the price change.");
      return { planCode: input.planCode, currency: input.currency, interval, amountMinor, reason };
    },
  )
  .handler(async ({ data, context }) => {
    const role = await roleOf(context.supabase as never);
    if (role !== "platform_owner" && role !== "platform_finance") {
      throw new Error("Only platform billing staff can draft a price.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settings } = await supabaseAdmin
      .from("billing_settings" as never)
      .select("require_owner_approval" as never)
      .eq("id" as never, true as never)
      .maybeSingle();
    const approval =
      (settings as { require_owner_approval?: boolean } | null)?.require_owner_approval !== false;
    const status = role === "platform_finance" && approval ? "review" : "draft";
    const { data: latest } = await supabaseAdmin
      .from("plan_versions" as never)
      .select("version_no, name" as never)
      .eq("plan_code" as never, data.planCode as never)
      .order("version_no" as never, { ascending: false } as never)
      .limit(1)
      .maybeSingle();
    const previous = latest as { version_no: number; name: string } | null;
    const { data: created, error } = await supabaseAdmin
      .from("plan_versions" as never)
      .insert({
        plan_code: data.planCode,
        version_no: (previous?.version_no ?? 0) + 1,
        status,
        name: previous?.name ?? data.planCode,
        visibility: "draft",
        created_by: context.userId,
        reason: data.reason,
      } as never)
      .select("id" as never)
      .single();
    if (error) throw new Error(error.message);
    const versionId = (created as { id: string }).id;
    const { error: priceError } = await supabaseAdmin.from("plan_prices" as never).insert({
      version_id: versionId,
      currency: data.currency,
      billing_interval: data.interval,
      amount_minor: data.amountMinor,
      needs_review: data.currency !== "USD",
    } as never);
    if (priceError) throw new Error(priceError.message);
    await audit(
      "draft_price",
      versionId,
      previous,
      { status, amountMinor: data.amountMinor },
      data.reason,
      context.userId,
    );
    let marginWarning: string | null = null;
    if (data.currency === "USD" && data.interval === "month") {
      const { data: costs } = await supabaseAdmin
        .from("billing_cost_inputs" as never)
        .select("*" as never);
      const rows = (
        (costs ?? []) as {
          key: string;
          unit_cost_minor_usd: number;
          typical_quantity: number;
          max_quantity: number;
        }[]
      ).map((row) => ({
        key: row.key,
        unitCostMinorUsd:
          row.key === "card_fee_bps"
            ? Math.round((data.amountMinor * row.unit_cost_minor_usd) / 10_000)
            : row.unit_cost_minor_usd,
        typicalQuantity: row.key === "card_fee_bps" ? 1 : row.typical_quantity,
        maxQuantity: row.key === "card_fee_bps" ? 1 : row.max_quantity,
      }));
      const margin = planMargin(data.amountMinor, rows);
      if (margin.belowTypicalFloor) marginWarning = "Typical gross margin is below 70%.";
      else if (margin.belowMaxFloor) marginWarning = "Margin at maximum usage is below 40%.";
    }
    return { versionId, status, marginWarning };
  });

export const publishPlanVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { versionId: string; reason: string; password?: string }) => ({
    versionId: assertUuid(input?.versionId),
    reason: (input?.reason ?? "").trim(),
    password: input?.password ?? "",
  }))
  .handler(async ({ data, context }) => {
    const role = await roleOf(context.supabase as never);
    if (role !== "platform_owner") throw new Error("Only the platform owner can publish a price.");
    if (data.reason.length < 3) throw new Error("Record a reason for publishing.");
    await confirmSensitiveChange(
      context.claims as { aal?: unknown; email?: unknown },
      data.password,
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: version, error } = await supabaseAdmin
      .from("plan_versions" as never)
      .select("id, plan_code, status" as never)
      .eq("id" as never, data.versionId as never)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const row = version as { id: string; plan_code: string; status: string } | null;
    if (!row || (row.status !== "draft" && row.status !== "review")) {
      throw new Error("Only a draft or review version can be published.");
    }
    await supabaseAdmin
      .from("plan_versions" as never)
      .update({ status: "archived", visibility: "hidden" } as never)
      .eq("plan_code" as never, row.plan_code as never)
      .eq("status" as never, "published" as never);
    const { error: publishError } = await supabaseAdmin
      .from("plan_versions" as never)
      .update({
        status: "published",
        visibility: "live",
        published_at: new Date().toISOString(),
        effective_from: new Date().toISOString(),
        reason: data.reason,
      } as never)
      .eq("id" as never, row.id as never);
    if (publishError) throw new Error(publishError.message);
    await audit(
      "publish_price",
      row.id,
      { status: row.status },
      { status: "published" },
      data.reason,
      context.userId,
    );
    return { ok: true as const, grandfathered: true as const };
  });

export const rollbackPlanVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { planCode: string; reason: string; password?: string }) => {
    if (!isPlanCode(input?.planCode)) throw new Error("Choose a plan.");
    return {
      planCode: input.planCode,
      reason: (input?.reason ?? "").trim(),
      password: input?.password ?? "",
    };
  })
  .handler(async ({ data, context }) => {
    const role = await roleOf(context.supabase as never);
    if (role !== "platform_owner")
      throw new Error("Only the platform owner can roll back a price.");
    if (data.reason.length < 3) throw new Error("Record a reason for the rollback.");
    await confirmSensitiveChange(
      context.claims as { aal?: unknown; email?: unknown },
      data.password,
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: archived, error } = await supabaseAdmin
      .from("plan_versions" as never)
      .select("id, version_no" as never)
      .eq("plan_code" as never, data.planCode as never)
      .eq("status" as never, "archived" as never)
      .order("version_no" as never, { ascending: false } as never)
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const previous = archived as { id: string; version_no: number } | null;
    if (!previous) throw new Error("There is no earlier version to restore.");
    await supabaseAdmin
      .from("plan_versions" as never)
      .update({ status: "archived", visibility: "hidden" } as never)
      .eq("plan_code" as never, data.planCode as never)
      .eq("status" as never, "published" as never);
    const { error: restoreError } = await supabaseAdmin
      .from("plan_versions" as never)
      .update({ status: "published", visibility: "live", reason: data.reason } as never)
      .eq("id" as never, previous.id as never);
    if (restoreError) throw new Error(restoreError.message);
    await audit(
      "rollback_price",
      previous.id,
      null,
      { status: "published" },
      data.reason,
      context.userId,
    );
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
    const role = await roleOf(context.supabase as never);
    if (!canRefund(role)) throw new Error("This console is limited to platform staff.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: subscription, error } = await supabaseAdmin
      .from("company_subscriptions" as never)
      .select("unit_amount_minor" as never)
      .eq("company_id" as never, data.companyId as never)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const cap =
      (subscription as { unit_amount_minor: number | null } | null)?.unit_amount_minor ?? 0;
    if (role === "platform_support" && data.amountMinor > cap) {
      throw new Error("Support refunds cannot exceed the current subscription charge.");
    }
    const secret = process.env["STRIPE_SECRET_KEY"];
    if (!secret) throw new Error("Stripe is not configured.");
    assertStripeTestKey(secret);
    const response = await fetch("https://api.stripe.com/v1/refunds", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: stripeRefundBody(data.paymentIntent, data.amountMinor, data.reason),
    });
    const payload = (await response.json()) as { id?: string; error?: { message?: string } };
    if (!response.ok || !payload.id)
      throw new Error(payload.error?.message ?? "Stripe could not refund that payment.");
    await audit(
      "refund",
      data.companyId,
      null,
      { refundId: payload.id, amountMinor: data.amountMinor },
      data.reason,
      context.userId,
    );
    return { refundId: payload.id };
  });
