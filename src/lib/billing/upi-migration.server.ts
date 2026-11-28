/**
 * Razorpay UPI / e-mandate plan migration (create new sub → webhook → cancel old).
 * Card and Stripe paths must not call these helpers.
 */
import {
  estimateProratedDifferenceMinor,
  remainingBillingDays,
} from "@/lib/billing/plan-change-math";
import {
  canTransitionUpiMigration,
  upfrontMigrationEnabled,
  upiMigrationFeatureEnabled,
  type UpiMigrationStatus,
} from "@/lib/billing/upi-migration-states";
import { unixToIso } from "@/lib/billing/providers/normalise";

export type UpiMigrationRow = {
  id: string;
  companyId: string;
  status: UpiMigrationStatus;
  provider: "razorpay";
  mandateKind: "upi" | "emandate";
  oldProviderSubscriptionId: string;
  newProviderSubscriptionId: string | null;
  checkoutId: string | null;
  fromPlanCode: string;
  toPlanCode: string;
  fromInterval: "month" | "year";
  toInterval: "month" | "year";
  currency: string;
  fromAmountMinor: number;
  toAmountMinor: number;
  proratedEstimateMinor: number;
  upfrontAddonMinor: number;
  upfrontEnabled: boolean;
  failureReason: string | null;
  cancelAttempts: number;
  nextRetryAt: string | null;
  confirmedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type Admin = {
  rpc: (
    fn: never,
    args?: never,
  ) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>;
  from: (table: never) => {
    insert: (row: never) => {
      select: (cols: never) => {
        single: () => PromiseLike<{ data: unknown; error: { message: string } | null }>;
      };
    };
    update: (row: never) => {
      eq: (col: never, val: never) => PromiseLike<{ error: { message: string } | null }>;
    };
  };
};

async function admin(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Admin;
}

async function rpc<T>(client: Admin, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(fn as never, args as never);
  if (error) throw new Error(error.message);
  return data as T;
}

export function parseMigrationRow(raw: unknown): UpiMigrationRow | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row["id"] !== "string" || typeof row["status"] !== "string") return null;
  return {
    id: row["id"] as string,
    companyId: String(row["companyId"]),
    status: row["status"] as UpiMigrationStatus,
    provider: "razorpay",
    mandateKind: row["mandateKind"] === "emandate" ? "emandate" : "upi",
    oldProviderSubscriptionId: String(row["oldProviderSubscriptionId"]),
    newProviderSubscriptionId:
      row["newProviderSubscriptionId"] == null ? null : String(row["newProviderSubscriptionId"]),
    checkoutId: row["checkoutId"] == null ? null : String(row["checkoutId"]),
    fromPlanCode: String(row["fromPlanCode"]),
    toPlanCode: String(row["toPlanCode"]),
    fromInterval: row["fromInterval"] === "year" ? "year" : "month",
    toInterval: row["toInterval"] === "year" ? "year" : "month",
    currency: String(row["currency"]),
    fromAmountMinor: Number(row["fromAmountMinor"] ?? 0),
    toAmountMinor: Number(row["toAmountMinor"] ?? 0),
    proratedEstimateMinor: Number(row["proratedEstimateMinor"] ?? 0),
    upfrontAddonMinor: Number(row["upfrontAddonMinor"] ?? 0),
    upfrontEnabled: row["upfrontEnabled"] !== false,
    failureReason: row["failureReason"] == null ? null : String(row["failureReason"]),
    cancelAttempts: Number(row["cancelAttempts"] ?? 0),
    nextRetryAt: row["nextRetryAt"] == null ? null : String(row["nextRetryAt"]),
    confirmedAt: row["confirmedAt"] == null ? null : String(row["confirmedAt"]),
    completedAt: row["completedAt"] == null ? null : String(row["completedAt"]),
    createdAt: String(row["createdAt"] ?? ""),
    updatedAt: String(row["updatedAt"] ?? ""),
  };
}

async function transition(
  client: Admin,
  id: string,
  from: UpiMigrationStatus[],
  to: UpiMigrationStatus,
  patch: Record<string, unknown> = {},
): Promise<UpiMigrationRow> {
  for (const f of from) {
    if (!canTransitionUpiMigration(f, to) && f !== to) {
      // allow list checked per actual row status inside SQL
    }
  }
  const row = parseMigrationRow(
    await rpc(client, "billing_migration_transition", {
      _id: id,
      _from_statuses: from,
      _to_status: to,
      _patch: patch,
    }),
  );
  if (!row) throw new Error("Migration transition returned no row.");
  return row;
}

export async function getOpenUpiMigration(companyId: string): Promise<UpiMigrationRow | null> {
  const client = await admin();
  return parseMigrationRow(
    await rpc(client, "billing_migration_open_for_company", { _company_id: companyId }),
  );
}

export async function getUpiMigration(id: string): Promise<UpiMigrationRow | null> {
  const client = await admin();
  return parseMigrationRow(await rpc(client, "billing_migration_get", { _id: id }));
}

export function buildUpiMigrationPreviewAmounts(input: {
  currentAmountMinor: number;
  targetAmountMinor: number;
  periodStartIso: string | null;
  periodEndIso: string | null;
  currency: string;
  env?: Record<string, string | undefined>;
}) {
  const estimate = estimateProratedDifferenceMinor({
    currentAmountMinor: input.currentAmountMinor,
    targetAmountMinor: input.targetAmountMinor,
    periodStartIso: input.periodStartIso,
    periodEndIso: input.periodEndIso,
  });
  const upfrontOn = upfrontMigrationEnabled(input.env);
  const upfront = upfrontOn ? estimate : 0;
  return {
    remainingDays: remainingBillingDays(input.periodEndIso),
    proratedEstimateMinor: estimate,
    upfrontAddonMinor: upfront,
    upfrontEnabled: upfrontOn,
    amountDueIsEstimate: true,
    currency: input.currency,
    nextRenewalAt: input.periodEndIso,
    newRecurringMinor: input.targetAmountMinor,
  };
}

export type StartUpiMigrationInput = {
  companyId: string;
  userId: string;
  planCode: string;
  interval: "month" | "year";
  planPriceId: string;
  planName: string;
  currency: string;
  fromPlanCode: string;
  fromInterval: "month" | "year";
  fromAmountMinor: number;
  toAmountMinor: number;
  oldProviderSubscriptionId: string;
  mandateKind: "upi" | "emandate";
  periodStartIso: string | null;
  periodEndIso: string | null;
  chargeAtUnix: number | null;
  origin: string;
};

/**
 * Creates migration row + open checkout + new Razorpay subscription.
 * Does **not** cancel the old subscription.
 */
export async function startUpiSubscriptionMigration(
  input: StartUpiMigrationInput,
): Promise<{ migration: UpiMigrationRow; checkoutUrl: string }> {
  if (!upiMigrationFeatureEnabled()) {
    throw new Error("UPI plan migration is temporarily unavailable.");
  }
  const amounts = buildUpiMigrationPreviewAmounts({
    currentAmountMinor: input.fromAmountMinor,
    targetAmountMinor: input.toAmountMinor,
    periodStartIso: input.periodStartIso,
    periodEndIso: input.periodEndIso,
    currency: input.currency,
  });

  const client = await admin();
  const open = parseMigrationRow(
    await rpc(client, "billing_migration_open_for_company", { _company_id: input.companyId }),
  );
  if (open) {
    throw new Error(
      "A plan migration is already in progress. Finish or wait for it before starting another.",
    );
  }

  const idempotencyKey = [
    "upi-mig",
    input.companyId,
    input.oldProviderSubscriptionId,
    input.planPriceId,
    // 10-minute bucket so double-clicks reuse one migration attempt window.
    String(Math.floor(Date.now() / 600_000)),
  ].join(":");

  let migration = parseMigrationRow(
    await rpc(client, "billing_migration_insert", {
      _company_id: input.companyId,
      _actor: input.userId,
      _mandate_kind: input.mandateKind,
      _old_sub_id: input.oldProviderSubscriptionId,
      _from_plan: input.fromPlanCode,
      _to_plan: input.planCode,
      _from_interval: input.fromInterval,
      _to_interval: input.interval,
      _currency: input.currency,
      _from_amount: input.fromAmountMinor,
      _to_amount: input.toAmountMinor,
      _prorated: amounts.proratedEstimateMinor,
      _upfront: amounts.upfrontAddonMinor,
      _upfront_enabled: amounts.upfrontEnabled,
      _plan_price_id: input.planPriceId,
      _idempotency_key: idempotencyKey,
    }),
  );
  if (!migration) throw new Error("Could not create the migration record.");

  if (
    migration.status !== "initiated" &&
    migration.checkoutId &&
    migration.newProviderSubscriptionId
  ) {
    const { razorpayHostedCheckoutUrl, razorpaySubscriptionReturnUrl } =
      await import("@/lib/billing/razorpay-hosted-checkout");
    const successUrl = razorpaySubscriptionReturnUrl(input.origin);
    return {
      migration,
      checkoutUrl: razorpayHostedCheckoutUrl({
        origin: input.origin,
        subscriptionId: migration.newProviderSubscriptionId,
        checkoutId: migration.checkoutId,
        successUrl,
        cancelUrl: `${input.origin}/settings?section=subscription&checkout=cancel`,
        planName: input.planName,
      }),
    };
  }

  const { data: checkout, error: checkoutError } = await client
    .from("billing_checkouts" as never)
    .insert({
      company_id: input.companyId,
      plan_code: input.planCode,
      billing_interval: input.interval,
      provider: "razorpay",
      currency: input.currency,
      unit_amount_minor: input.toAmountMinor,
      plan_price_id: input.planPriceId,
      created_by: input.userId,
      status: "open",
    } as never)
    .select("id" as never)
    .single();
  if (checkoutError) throw new Error(checkoutError.message);
  const checkoutId = (checkout as { id: string }).id;

  const { ensureProviderPrice } = await import("@/lib/billing/providers/price-mapping.server");
  const providerPriceId = await ensureProviderPrice("razorpay", {
    planPriceId: input.planPriceId,
    planName: input.planName,
    currency: input.currency,
    amountMinor: input.toAmountMinor,
    interval: input.interval,
  });

  const { createRazorpayClient, razorpayUpiMigrationSubscriptionRequest } =
    await import("@/lib/billing/providers/razorpay.server");
  const razorpay = createRazorpayClient();

  // Align first recurring debit with the old cycle when Razorpay provides charge_at;
  // otherwise start after authorisation (immediate entitlement via webhook).
  const startAtUnix =
    input.chargeAtUnix != null && input.chargeAtUnix > Math.floor(Date.now() / 1000) + 300
      ? input.chargeAtUnix
      : null;

  const created = await razorpay.request(
    "POST",
    "subscriptions",
    razorpayUpiMigrationSubscriptionRequest({
      planId: providerPriceId,
      interval: input.interval,
      checkoutId,
      companyId: input.companyId,
      planCode: input.planCode,
      currency: input.currency,
      migrationId: migration.id,
      replaceSubscriptionId: input.oldProviderSubscriptionId,
      payMethod: input.mandateKind,
      startAtUnix,
      upfrontAddonMinor: amounts.upfrontAddonMinor,
    }),
  );
  const newSubId = typeof created["id"] === "string" ? created["id"] : "";
  if (!newSubId) throw new Error("Razorpay did not return a subscription id.");

  const { error: linkError } = await client
    .from("billing_checkouts" as never)
    .update({ provider_session_id: newSubId } as never)
    .eq("id" as never, checkoutId as never);
  if (linkError) throw new Error(linkError.message);

  migration = await transition(client, migration.id, ["initiated"], "new_subscription_created", {
    newProviderSubscriptionId: newSubId,
    checkoutId,
  });
  migration = await transition(
    client,
    migration.id,
    ["new_subscription_created"],
    "awaiting_customer_authorization",
    {
      nextRetryAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    },
  );

  const { razorpayHostedCheckoutUrl, razorpaySubscriptionReturnUrl } =
    await import("@/lib/billing/razorpay-hosted-checkout");
  const successUrl = razorpaySubscriptionReturnUrl(input.origin);
  return {
    migration,
    checkoutUrl: razorpayHostedCheckoutUrl({
      origin: input.origin,
      subscriptionId: newSubId,
      checkoutId,
      successUrl,
      cancelUrl: `${input.origin}/settings?section=subscription&checkout=cancel`,
      planName: input.planName,
    }),
  };
}

/** After checkout_completed applied for a migration checkout — cancel the old mandate. */
export async function onUpiMigrationNewSubscriptionConfirmed(input: {
  checkoutId: string;
  newSubscriptionId: string;
}): Promise<UpiMigrationRow | null> {
  const client = await admin();
  let migration = parseMigrationRow(
    await rpc(client, "billing_migration_by_checkout", { _checkout_id: input.checkoutId }),
  );
  if (!migration) {
    migration = parseMigrationRow(
      await rpc(client, "billing_migration_by_new_subscription", {
        _subscription_id: input.newSubscriptionId,
      }),
    );
  }
  if (!migration) return null;
  if (migration.status === "completed" || migration.status === "failed") return migration;

  if (
    migration.status === "awaiting_customer_authorization" ||
    migration.status === "awaiting_payment" ||
    migration.status === "new_subscription_created" ||
    migration.status === "initiated"
  ) {
    migration = await transition(
      client,
      migration.id,
      [
        "initiated",
        "new_subscription_created",
        "awaiting_customer_authorization",
        "awaiting_payment",
      ],
      "new_subscription_confirmed",
      {
        newProviderSubscriptionId: input.newSubscriptionId,
        markConfirmed: "true",
      },
    );
  }

  return cancelOldSubscriptionForMigration(migration.id);
}

export async function cancelOldSubscriptionForMigration(
  migrationId: string,
): Promise<UpiMigrationRow> {
  const client = await admin();
  let migration = parseMigrationRow(
    await rpc(client, "billing_migration_get", { _id: migrationId }),
  );
  if (!migration) throw new Error("Unknown migration.");

  if (migration.status === "completed") return migration;

  if (
    migration.status === "new_subscription_confirmed" ||
    migration.status === "old_subscription_cancellation_failed" ||
    migration.status === "requires_manual_review"
  ) {
    migration = await transition(
      client,
      migration.id,
      [
        "new_subscription_confirmed",
        "old_subscription_cancellation_failed",
        "requires_manual_review",
      ],
      "old_subscription_cancellation_pending",
      { bumpCancelAttempts: "true" },
    );
  } else if (migration.status !== "old_subscription_cancellation_pending") {
    return migration;
  }

  const { createRazorpayClient, razorpayCancelImmediate, razorpayInspectSubscription } =
    await import("@/lib/billing/providers/razorpay.server");
  const razorpay = createRazorpayClient();

  try {
    const inspected = await razorpayInspectSubscription(
      razorpay,
      migration.oldProviderSubscriptionId,
    );
    if (/cancel|complet|expir|halted/i.test(inspected.status)) {
      return transition(
        client,
        migration.id,
        ["old_subscription_cancellation_pending"],
        "completed",
        {
          markOldCancelled: "true",
          nextRetryAt: null,
        },
      );
    }
    await razorpayCancelImmediate(razorpay, migration.oldProviderSubscriptionId);
    return transition(
      client,
      migration.id,
      ["old_subscription_cancellation_pending"],
      "completed",
      {
        markOldCancelled: "true",
        nextRetryAt: null,
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cancel failed";
    const attempts = migration.cancelAttempts + 1;
    const next =
      attempts >= 8
        ? ("requires_manual_review" as const)
        : ("old_subscription_cancellation_failed" as const);
    console.error(
      "UPI migration old-subscription cancel failed",
      JSON.stringify({ migrationId, attempts, message }),
    );
    return transition(client, migration.id, ["old_subscription_cancellation_pending"], next, {
      failureReason: message,
      nextRetryAt: new Date(
        Date.now() + Math.min(3600, 30 * 2 ** Math.min(attempts, 6)) * 1000,
      ).toISOString(),
    });
  }
}

/** Called from webhook-retry cron — idempotent recovery. */
export async function recoverDueUpiMigrations(
  limit = 20,
): Promise<{ processed: number; failed: number; manual: number }> {
  if (!upiMigrationFeatureEnabled()) return { processed: 0, failed: 0, manual: 0 };
  const client = await admin();
  const ids = (await rpc<string[]>(client, "billing_migration_due", { _limit: limit })) ?? [];
  let processed = 0;
  let failed = 0;
  let manual = 0;
  for (const id of ids) {
    try {
      const row = parseMigrationRow(await rpc(client, "billing_migration_get", { _id: id }));
      if (!row) continue;
      if (
        row.status === "old_subscription_cancellation_pending" ||
        row.status === "old_subscription_cancellation_failed" ||
        row.status === "new_subscription_confirmed"
      ) {
        const next = await cancelOldSubscriptionForMigration(id);
        if (next.status === "requires_manual_review") manual += 1;
        else processed += 1;
        continue;
      }
      if (row.status === "awaiting_customer_authorization" || row.status === "awaiting_payment") {
        const ageMs = Date.now() - Date.parse(row.createdAt || row.updatedAt);
        if (Number.isFinite(ageMs) && ageMs > 24 * 60 * 60 * 1000) {
          await transition(
            client,
            id,
            ["awaiting_customer_authorization", "awaiting_payment"],
            "failed",
            {
              failureReason: "Customer did not complete UPI mandate authorisation in time.",
              nextRetryAt: null,
            },
          );
          failed += 1;
        } else {
          processed += 1;
        }
      }
    } catch (error) {
      failed += 1;
      console.error(
        "UPI migration recovery item failed",
        JSON.stringify({
          migrationId: id,
          message: error instanceof Error ? error.message : "failed",
        }),
      );
    }
  }
  return { processed, failed, manual };
}

export function migrationCustomerCopy(status: UpiMigrationStatus): string {
  switch (status) {
    case "awaiting_customer_authorization":
    case "awaiting_payment":
    case "new_subscription_created":
      return "Authorise the new UPI AutoPay mandate to finish your upgrade. Your current plan stays active until then.";
    case "new_subscription_confirmed":
    case "old_subscription_cancellation_pending":
    case "entitlement_update_pending":
      return "New plan confirmed. Finishing cancellation of your previous mandate…";
    case "old_subscription_cancellation_failed":
      return "Your new plan is active. We are still cancelling the old mandate — you will not be asked to pay twice if recovery succeeds. Contact support if this persists.";
    case "requires_manual_review":
      return "Your upgrade needs a short review to finish cancelling the old mandate. Support has been alerted.";
    case "completed":
      return "Upgrade complete. You are on the new plan.";
    case "failed":
      return "This upgrade did not finish. Your previous plan is unchanged.";
    default:
      return "Preparing your plan upgrade…";
  }
}

export { unixToIso };
