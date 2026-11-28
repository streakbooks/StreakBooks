/**
 * Platform subscription administration: complimentary grants, trial extend/end,
 * and customer subscription detail. Org owners cannot call these — RPCs require
 * platform billing.manage / subscriptions.view.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  if (result.data == null) throw new Error("Empty platform response.");
  return result.data;
}

export type SubscriptionAdminDetail = {
  company: {
    id: string;
    name: string;
    countryCode: string | null;
    isDemo: boolean;
  } | null;
  subscription: {
    companyId: string;
    planCode: string;
    status: string;
    provider: string;
    providerSubscriptionId: string | null;
    billingInterval: string | null;
    currency: string | null;
    unitAmountMinor: number | null;
    trialStartedAt: string | null;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean | null;
    startedAt: string | null;
    updatedAt: string | null;
  } | null;
  activeGrant: {
    id: string;
    planCode: string;
    status: string;
    startsAt: string;
    endsAt: string | null;
    lifetime: boolean;
    reason: string;
    notes: string;
  } | null;
  entitlementOverrides: Array<{
    id: string;
    featureKey: string;
    source: string;
    effect: string;
    limitValue: number | null;
    startsAt: string | null;
    expiresAt: string | null;
    reason: string;
    notes: string;
    createdAt: string;
  }>;
  winningEntitlements: Record<string, { allowed?: boolean; limit?: number | null }>;
  audit: Array<{
    id: number;
    action: string;
    actorId: string | null;
    reason: string;
    after: Record<string, string | number | boolean | null> | null;
    createdAt: string;
  }>;
};

export const getPlatformSubscriptionAdminDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ companyId: z.string().uuid() }).parse(v))
  .handler(async ({ context, data }) =>
    unwrap<SubscriptionAdminDetail>(
      await context.supabase.rpc(
        "platform_subscription_admin_detail" as never,
        { _company_id: data.companyId } as never,
      ),
    ),
  );

export const grantPlatformSubscriptionAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        planCode: z.string().trim().min(2).max(64),
        endsAt: z.string().datetime().nullable(),
        lifetime: z.boolean().default(false),
        reason: z.string().trim().min(3).max(1000),
        notes: z.string().trim().max(2000).default(""),
        acknowledgePaidOverlap: z.boolean().default(false),
      })
      .refine((row) => row.lifetime || row.endsAt != null, {
        message: "Set an end date or mark the grant as lifetime.",
      })
      .parse(v),
  )
  .handler(async ({ context, data }) =>
    unwrap<{ ok: true; grantId: string; paidOverlap: boolean }>(
      await context.supabase.rpc(
        "platform_grant_subscription_access" as never,
        {
          _company_id: data.companyId,
          _plan_code: data.planCode,
          _ends_at: data.endsAt,
          _lifetime: data.lifetime,
          _reason: data.reason,
          _notes: data.notes,
          _acknowledge_paid_overlap: data.acknowledgePaidOverlap,
        } as never,
      ),
    ),
  );

export const revokePlatformSubscriptionAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        reason: z.string().trim().min(3).max(1000),
      })
      .parse(v),
  )
  .handler(async ({ context, data }) =>
    unwrap<{ ok: true; grantId: string }>(
      await context.supabase.rpc(
        "platform_revoke_subscription_access" as never,
        { _company_id: data.companyId, _reason: data.reason } as never,
      ),
    ),
  );

export const extendPlatformCompanyTrial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        extraDays: z.number().int().min(1).max(366).nullable().default(null),
        newEndsAt: z.string().datetime().nullable().default(null),
        reason: z.string().trim().min(3).max(1000),
        notes: z.string().trim().max(2000).default(""),
      })
      .refine((row) => row.newEndsAt != null || (row.extraDays != null && row.extraDays >= 1), {
        message: "Provide extra days or a new expiry date.",
      })
      .parse(v),
  )
  .handler(async ({ context, data }) =>
    unwrap<{ ok: true; trialEndsAt: string; previousEndsAt: string | null }>(
      await context.supabase.rpc(
        "platform_extend_company_trial" as never,
        {
          _company_id: data.companyId,
          _extra_days: data.extraDays,
          _reason: data.reason,
          _notes: data.notes,
          _new_ends_at: data.newEndsAt,
        } as never,
      ),
    ),
  );

export const endPlatformCompanyTrial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        reason: z.string().trim().min(3).max(1000),
      })
      .parse(v),
  )
  .handler(async ({ context, data }) =>
    unwrap<{ ok: true }>(
      await context.supabase.rpc(
        "platform_end_company_trial" as never,
        { _company_id: data.companyId, _reason: data.reason } as never,
      ),
    ),
  );

export const setPlatformEntitlementLimit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        feature: z.string().trim().min(2).max(64),
        limitValue: z.number().int().nonnegative(),
        expiresAt: z.string().datetime().nullable().default(null),
        reason: z.string().trim().min(3).max(1000),
        notes: z.string().trim().max(2000).default(""),
      })
      .parse(v),
  )
  .handler(async ({ context, data }) =>
    unwrap<{ ok: true; id: string }>(
      await context.supabase.rpc(
        "platform_set_entitlement_limit" as never,
        {
          _feature: data.feature,
          _company_id: data.companyId,
          _limit_value: data.limitValue,
          _expires: data.expiresAt,
          _reason: data.reason,
          _notes: data.notes,
        } as never,
      ),
    ),
  );
