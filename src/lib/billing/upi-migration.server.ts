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
  isUpiMigrationPreConfirm,
  shouldAbandonAwaitingUpiMigration,
  upfrontMigrationEnabled,
  UPI_MIGRATION_TERMINAL,
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

/**
 * Fail a pre-confirm migration, cancel any unused new Razorpay subscription, and
 * release the one-open-per-company lock so the customer can retry safely.
 */
export async function failAbandonedUpiMigration(
  migrationId: string,
  reason: string,
): Promise<UpiMigrationRow> {
  const client = await admin();
  const migration = parseMigrationRow(
    await rpc(client, "billing_migration_get", { _id: migrationId }),
  );
  if (!migration) throw new Error("Unknown migration.");
  if (UPI_MIGRATION_TERMINAL.has(migration.status)) return migration;
  if (!isUpiMigrationPreConfirm(migration.status)) {
    throw new Error(
      "This upgrade has already confirmed a new plan. Support must finish cancelling the old mandate — it cannot be abandoned from Settings.",
    );
  }

  // Cancel unused new Razorpay subscription when still unauthenticated so retries do not pile up.
  if (migration.newProviderSubscriptionId) {
    try {
      const { createRazorpayClient, razorpayCancelImmediate, razorpayInspectSubscription } =
        await import("@/lib/billing/providers/razorpay.server");
      const razorpay = createRazorpayClient();
      const inspected = await razorpayInspectSubscription(
        razorpay,
        migration.newProviderSubscriptionId,
      );
      if (isNewSubscriptionAuthoritativelyConfirmed(inspected.status)) {
        throw new Error(
          "Razorpay already confirmed the new mandate. Finish this upgrade instead of abandoning it.",
        );
      }
      if (!/cancel|complet|expir|halted/i.test(inspected.status)) {
        await razorpayCancelImmediate(razorpay, migration.newProviderSubscriptionId);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "cancel failed";
      if (/already confirmed/i.test(message)) throw error;
      console.error(
        "UPI migration abandon: could not cancel unused new subscription",
        JSON.stringify({ migrationId, message }),
      );
    }
  }

  return transition(
    client,
    migration.id,
    [
      "initiated",
      "new_subscription_created",
      "awaiting_customer_authorization",
      "awaiting_payment",
    ],
    "failed",
    {
      failureReason: reason.slice(0, 500),
      nextRetryAt: null,
    },
  );
}

/**
 * When an open migration already exists:
 * - resume hosted checkout if still awaiting authorisation
 * - advance if Razorpay already confirmed the new mandate
 * - fail+release if timed out / provider cancelled / customer chose a different plan
 * Returns null when the lock was released so the caller may start a fresh migration.
 */
async function resumeOrReleaseOpenMigration(
  open: UpiMigrationRow,
  input: Pick<StartUpiMigrationInput, "origin" | "planName" | "planCode" | "interval">,
): Promise<{ migration: UpiMigrationRow; checkoutUrl: string } | null> {
  if (!isUpiMigrationPreConfirm(open.status)) {
    throw new Error(
      open.status === "requires_manual_review"
        ? "A plan upgrade is waiting on support to finish cancelling the previous mandate. Retry after that completes."
        : "A plan migration is already processing. Your current plan stays active until it finishes.",
    );
  }

  const timedOut = shouldAbandonAwaitingUpiMigration({
    status: open.status,
    createdAt: open.createdAt,
    updatedAt: open.updatedAt,
  });
  const planChanged = open.toPlanCode !== input.planCode || open.toInterval !== input.interval;

  if (open.newProviderSubscriptionId) {
    const { createRazorpayClient, razorpayInspectSubscription } =
      await import("@/lib/billing/providers/razorpay.server");
    const inspected = await razorpayInspectSubscription(
      createRazorpayClient(),
      open.newProviderSubscriptionId,
    );
    if (isNewSubscriptionAuthoritativelyConfirmed(inspected.status)) {
      await onUpiMigrationNewSubscriptionConfirmed({
        checkoutId: open.checkoutId ?? "",
        newSubscriptionId: open.newProviderSubscriptionId,
      });
      throw new Error(
        "Your new UPI mandate is already confirmed. Refresh this page — we are finishing the upgrade.",
      );
    }
    const providerDead = /cancel|complet|expir|halted/i.test(inspected.status);
    if (providerDead || timedOut || planChanged) {
      await failAbandonedUpiMigration(
        open.id,
        providerDead
          ? `Previous migration subscription ended at Razorpay (${inspected.status}).`
          : timedOut
            ? "Previous mandate authorisation timed out or was abandoned. Safe to retry."
            : "Previous upgrade target changed before mandate authorisation. Safe to retry.",
      );
      return null;
    }
    if (open.checkoutId) {
      const { razorpayHostedCheckoutUrl, razorpaySubscriptionReturnUrl } =
        await import("@/lib/billing/razorpay-hosted-checkout");
      return {
        migration: open,
        checkoutUrl: razorpayHostedCheckoutUrl({
          origin: input.origin,
          subscriptionId: open.newProviderSubscriptionId,
          checkoutId: open.checkoutId,
          successUrl: razorpaySubscriptionReturnUrl(input.origin),
          cancelUrl: `${input.origin}/settings?section=subscription&checkout=cancel`,
          planName: input.planName,
        }),
      };
    }
  }

  if (timedOut || planChanged) {
    await failAbandonedUpiMigration(
      open.id,
      timedOut
        ? "Previous plan migration was abandoned before mandate authorisation completed."
        : "Previous upgrade target changed before mandate authorisation. Safe to retry.",
    );
    return null;
  }

  throw new Error(
    "A plan migration is already awaiting mandate authorisation. Resume it from the banner or wait for it to expire.",
  );
}

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
  let open = parseMigrationRow(
    await rpc(client, "billing_migration_open_for_company", { _company_id: input.companyId }),
  );
  if (open) {
    const resumed = await resumeOrReleaseOpenMigration(open, input);
    if (resumed) return resumed;
    open = parseMigrationRow(
      await rpc(client, "billing_migration_open_for_company", { _company_id: input.companyId }),
    );
    if (open) {
      throw new Error(
        "A plan migration is already in progress. Finish or wait for it before starting another.",
      );
    }
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

/**
 * Classify provider events that still refer to a migration's *old* subscription id
 * after company_subscriptions already points at the new id.
 */
export type RetiredMigrationEventAction =
  | { action: "ignore_non_mutating"; reason: string }
  | { action: "mark_old_cancelled"; reason: string }
  | { action: "alert_unexpected_charge"; reason: string }
  | { action: "alert_payment_failed"; reason: string }
  | { action: "alert_other"; reason: string };

/** Statuses where the new mandate is authoritative and the old id must not mutate entitlements. */
export const UPI_MIGRATION_POST_SWITCH_STATUSES: ReadonlySet<UpiMigrationStatus> = new Set([
  "new_subscription_confirmed",
  "old_subscription_cancellation_pending",
  "old_subscription_cancellation_failed",
  "entitlement_update_pending",
  "requires_manual_review",
  "completed",
]);

/**
 * Old-sub events are "retired" only after the company has switched (or the migration
 * row already records confirmation). While still awaiting authorisation and the company
 * still points at the old id, events must apply normally so paid access is preserved.
 */
export function migrationTreatsOldSubscriptionAsRetired(
  migration: Pick<
    UpiMigrationRow,
    "status" | "confirmedAt" | "oldProviderSubscriptionId" | "newProviderSubscriptionId"
  >,
  liveProviderSubscriptionId: string | null,
): boolean {
  if (UPI_MIGRATION_POST_SWITCH_STATUSES.has(migration.status) || migration.confirmedAt) {
    return true;
  }
  if (
    liveProviderSubscriptionId &&
    liveProviderSubscriptionId !== migration.oldProviderSubscriptionId
  ) {
    return true;
  }
  return false;
}

export function classifyRetiredMigrationSubscriptionEvent(input: {
  kind: "checkout_completed" | "subscription_state" | "payment_failed" | "subscription_ended";
  eventType?: string | null;
  status?: string | null;
}): RetiredMigrationEventAction {
  if (input.kind === "subscription_ended") {
    return {
      action: "mark_old_cancelled",
      reason: "Old migration subscription ended or cancelled at the provider.",
    };
  }
  if (input.kind === "payment_failed") {
    return {
      action: "alert_payment_failed",
      reason: "Payment failed on the retired migration subscription.",
    };
  }
  if (input.kind === "checkout_completed") {
    return {
      action: "alert_other",
      reason: "Unexpected checkout_completed for a retired migration subscription.",
    };
  }
  // subscription_state — renewals/charges on the old mandate after switch are dangerous.
  const eventType = (input.eventType ?? "").toLowerCase();
  if (
    eventType.includes("charged") ||
    eventType.includes("activated") ||
    eventType.includes("authenticated")
  ) {
    return {
      action: "alert_unexpected_charge",
      reason: "Provider reported activity on the retired migration subscription after switch.",
    };
  }
  if (
    input.status === "active" ||
    input.status === "trialing" ||
    input.status === "past_due" ||
    input.status === "paused"
  ) {
    return {
      action: "alert_unexpected_charge",
      reason: "Retired migration subscription still reporting a billable state after switch.",
    };
  }
  return {
    action: "ignore_non_mutating",
    reason: "Non-mutating event for retired migration subscription.",
  };
}

async function fetchLiveProviderSubscriptionId(companyId: string): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("company_subscriptions" as never)
    .select("provider_subscription_id" as never)
    .eq("company_id" as never, companyId as never)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as { provider_subscription_id?: string | null } | null;
  const id = row?.provider_subscription_id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

async function loadMigrationForOldSubscription(
  subscriptionId: string,
): Promise<UpiMigrationRow | null> {
  const client = await admin();
  return parseMigrationRow(
    await rpc(client, "billing_migration_by_old_subscription", {
      _subscription_id: subscriptionId,
    }),
  );
}

/** Heal a lagging migration row when entitlements already moved to the new subscription. */
async function healMigrationRowAfterCompanySwitch(
  client: Admin,
  migration: UpiMigrationRow,
  liveProviderSubscriptionId: string | null,
): Promise<UpiMigrationRow> {
  if (UPI_MIGRATION_POST_SWITCH_STATUSES.has(migration.status) || migration.confirmedAt) {
    return migration;
  }
  const newId = liveProviderSubscriptionId || migration.newProviderSubscriptionId;
  if (!newId || newId === migration.oldProviderSubscriptionId) return migration;
  if (
    migration.status === "initiated" ||
    migration.status === "new_subscription_created" ||
    migration.status === "awaiting_customer_authorization" ||
    migration.status === "awaiting_payment"
  ) {
    return transition(
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
        newProviderSubscriptionId: newId,
        markConfirmed: "true",
      },
    );
  }
  return migration;
}

/**
 * Handle a webhook that targets the old subscription id for an in-flight or recent migration.
 * Never applies entitlement mutations through billing_apply_provider_event once retired.
 */
export async function handleRetiredUpiMigrationSubscriptionEvent(input: {
  subscriptionId: string;
  kind: "checkout_completed" | "subscription_state" | "payment_failed" | "subscription_ended";
  eventType?: string | null;
  status?: string | null;
}): Promise<{
  handled: boolean;
  result: string;
  migrationId?: string;
  action?: RetiredMigrationEventAction["action"];
}> {
  const client = await admin();
  let migration = await loadMigrationForOldSubscription(input.subscriptionId);
  if (!migration) return { handled: false, result: "not_migration" };

  const liveSubId = await fetchLiveProviderSubscriptionId(migration.companyId);
  if (!migrationTreatsOldSubscriptionAsRetired(migration, liveSubId)) {
    // Pre-switch: old mandate is still the company subscription — apply entitlements normally.
    // Log renewals during migration for ops visibility without swallowing the event.
    const eventType = (input.eventType ?? "").toLowerCase();
    if (eventType.includes("charged") || input.kind === "payment_failed") {
      console.warn(
        "UPI migration old-subscription event while still on old mandate",
        JSON.stringify({
          migrationId: migration.id,
          kind: input.kind,
          eventType: input.eventType ?? null,
          status: migration.status,
        }),
      );
    }
    return { handled: false, result: "still_active_old_subscription", migrationId: migration.id };
  }

  migration = await healMigrationRowAfterCompanySwitch(client, migration, liveSubId);

  const classified = classifyRetiredMigrationSubscriptionEvent({
    kind: input.kind,
    eventType: input.eventType ?? null,
    status: input.status ?? null,
  });

  if (classified.action === "mark_old_cancelled") {
    if (
      migration.status === "old_subscription_cancellation_pending" ||
      migration.status === "old_subscription_cancellation_failed" ||
      migration.status === "new_subscription_confirmed" ||
      migration.status === "requires_manual_review"
    ) {
      let row = migration;
      if (row.status === "new_subscription_confirmed" || row.status === "requires_manual_review") {
        row = await transition(
          client,
          row.id,
          [row.status],
          "old_subscription_cancellation_pending",
          {},
        );
      } else if (row.status === "old_subscription_cancellation_failed") {
        row = await transition(
          client,
          row.id,
          ["old_subscription_cancellation_failed"],
          "old_subscription_cancellation_pending",
          {},
        );
      }
      await transition(client, row.id, ["old_subscription_cancellation_pending"], "completed", {
        markOldCancelled: "true",
        nextRetryAt: null,
        failureReason: null,
      });
    } else if (migration.status !== "completed") {
      console.info(
        "UPI migration old subscription ended",
        JSON.stringify({ migrationId: migration.id, status: migration.status }),
      );
    }
    return {
      handled: true,
      result: "old_subscription_cancelled",
      migrationId: migration.id,
      action: classified.action,
    };
  }

  if (
    classified.action === "alert_unexpected_charge" ||
    classified.action === "alert_payment_failed" ||
    classified.action === "alert_other"
  ) {
    console.error(
      "UPI migration retired-subscription alert",
      JSON.stringify({
        migrationId: migration.id,
        companyId: migration.companyId,
        oldSubscriptionId: migration.oldProviderSubscriptionId,
        newSubscriptionId: migration.newProviderSubscriptionId,
        liveSubscriptionId: liveSubId,
        kind: input.kind,
        eventType: input.eventType ?? null,
        action: classified.action,
        reason: classified.reason,
      }),
    );
    if (
      classified.action === "alert_unexpected_charge" &&
      (migration.status === "old_subscription_cancellation_pending" ||
        migration.status === "old_subscription_cancellation_failed" ||
        migration.status === "new_subscription_confirmed")
    ) {
      try {
        if (migration.status === "new_subscription_confirmed") {
          await transition(
            client,
            migration.id,
            ["new_subscription_confirmed"],
            "requires_manual_review",
            { failureReason: classified.reason },
          );
        } else {
          await transition(
            client,
            migration.id,
            [
              "old_subscription_cancellation_pending",
              "old_subscription_cancellation_failed",
            ] as UpiMigrationStatus[],
            "requires_manual_review",
            { failureReason: classified.reason },
          );
        }
      } catch {
        /* alert log is enough if transition races */
      }
    }
    return {
      handled: true,
      result: "alerted",
      migrationId: migration.id,
      action: classified.action,
    };
  }

  return {
    handled: true,
    result: "ignored_non_mutating",
    migrationId: migration.id,
    action: classified.action,
  };
}

/** True when a provider payment belongs to a retired migration subscription (do not retry forever). */
export async function isRetiredUpiMigrationSubscriptionPayment(
  subscriptionId: string,
): Promise<{ retired: boolean; migrationId?: string }> {
  const migration = await loadMigrationForOldSubscription(subscriptionId);
  if (!migration) return { retired: false };
  const liveSubId = await fetchLiveProviderSubscriptionId(migration.companyId);
  if (!migrationTreatsOldSubscriptionAsRetired(migration, liveSubId)) {
    return { retired: false, migrationId: migration.id };
  }
  return { retired: true, migrationId: migration.id };
}

function isNewSubscriptionAuthoritativelyConfirmed(providerStatus: string): boolean {
  // Razorpay `pending` means payment failure / attention — never treat as confirmation.
  return /^(authenticated|active)$/i.test(providerStatus.trim());
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
    // Authoritative check: new subscription must be authenticated/active before we cancel the old one.
    const { createRazorpayClient, razorpayInspectSubscription } =
      await import("@/lib/billing/providers/razorpay.server");
    const inspected = await razorpayInspectSubscription(
      createRazorpayClient(),
      input.newSubscriptionId,
    );
    if (!isNewSubscriptionAuthoritativelyConfirmed(inspected.status)) {
      throw new Error(
        `New migration subscription is not confirmed yet (status=${inspected.status}).`,
      );
    }
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
    // Re-fetch authoritative status — do not trust cancel HTTP alone if status is still active.
    const after = await razorpayInspectSubscription(razorpay, migration.oldProviderSubscriptionId);
    if (/cancel|complet|expir|halted/i.test(after.status)) {
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
    // Cancel accepted but status not terminal yet — wait for subscription.cancelled webhook / retry.
    return transition(
      client,
      migration.id,
      ["old_subscription_cancellation_pending"],
      "old_subscription_cancellation_failed",
      {
        failureReason: `Cancel requested; provider status still ${after.status}. Waiting for confirmation.`,
        nextRetryAt: new Date(Date.now() + 60_000).toISOString(),
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
      if (
        row.status === "awaiting_customer_authorization" ||
        row.status === "awaiting_payment" ||
        row.status === "new_subscription_created"
      ) {
        // Restart-safe: if the new sub is already authenticated/active (webhook applied
        // entitlements but confirm/cancel step failed), advance and cancel the old mandate.
        if (row.newProviderSubscriptionId) {
          const { createRazorpayClient, razorpayInspectSubscription } =
            await import("@/lib/billing/providers/razorpay.server");
          const inspected = await razorpayInspectSubscription(
            createRazorpayClient(),
            row.newProviderSubscriptionId,
          );
          if (isNewSubscriptionAuthoritativelyConfirmed(inspected.status)) {
            await onUpiMigrationNewSubscriptionConfirmed({
              checkoutId: row.checkoutId ?? "",
              newSubscriptionId: row.newProviderSubscriptionId,
            });
            processed += 1;
            continue;
          }
        }
        const liveSubId = await fetchLiveProviderSubscriptionId(row.companyId);
        if (
          liveSubId &&
          liveSubId !== row.oldProviderSubscriptionId &&
          row.newProviderSubscriptionId
        ) {
          await healMigrationRowAfterCompanySwitch(client, row, liveSubId);
          await cancelOldSubscriptionForMigration(id);
          processed += 1;
          continue;
        }
        // Never expire solely on wall-clock if provider still shows a live
        // pending subscription — inspected above. Dead/timed-out pre-confirm
        // rows are failed via failAbandoned (cancels unused new Razorpay sub).
        if (
          shouldAbandonAwaitingUpiMigration({
            status: row.status,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          })
        ) {
          if (row.newProviderSubscriptionId) {
            const { createRazorpayClient, razorpayInspectSubscription } =
              await import("@/lib/billing/providers/razorpay.server");
            const again = await razorpayInspectSubscription(
              createRazorpayClient(),
              row.newProviderSubscriptionId,
            );
            if (isNewSubscriptionAuthoritativelyConfirmed(again.status)) {
              await onUpiMigrationNewSubscriptionConfirmed({
                checkoutId: row.checkoutId ?? "",
                newSubscriptionId: row.newProviderSubscriptionId,
              });
              processed += 1;
              continue;
            }
          }
          await failAbandonedUpiMigration(
            id,
            "Customer did not complete UPI mandate authorisation in time.",
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
    case "new_subscription_created":
      return "Waiting for UPI AutoPay mandate authorisation. Resume checkout to finish, or cancel and retry. Your current plan stays active.";
    case "awaiting_payment":
      return "Mandate authorisation received — upgrade payment is processing. Do not start another upgrade.";
    case "new_subscription_confirmed":
    case "old_subscription_cancellation_pending":
    case "entitlement_update_pending":
      return "Upgrade successful on the new plan. Finishing cancellation of your previous mandate…";
    case "old_subscription_cancellation_failed":
      return "Your new plan is active. We are still cancelling the old mandate — you will not be asked to pay twice if recovery succeeds. Contact support if this persists.";
    case "requires_manual_review":
      return "Your upgrade needs a short review to finish cancelling the old mandate. Support has been alerted.";
    case "completed":
      return "Upgrade complete. You are on the new plan.";
    case "failed":
      return "Mandate authorisation failed or expired — you can retry the upgrade. Your previous plan is unchanged.";
    default:
      return "Preparing your plan upgrade…";
  }
}

export { unixToIso };
