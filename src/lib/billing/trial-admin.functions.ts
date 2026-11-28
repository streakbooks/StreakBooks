import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  if (result.data == null) throw new Error("Empty platform response.");
  return result.data;
}

export type TrialLifecycleAdmin = {
  policy: {
    enabled: boolean;
    defaultDays: number;
    requirePaymentMethod: boolean;
    firstTimeOnly: boolean;
    allowReuse: boolean;
    allowManualGrant: boolean;
    readOnlyAfterExpiry: boolean;
    version: number;
    updatedAt: string;
  };
  reminders: Array<{
    kind: string;
    enabled: boolean;
    daysBeforeExpiry: number | null;
    emailEnabled: boolean;
    inappEnabled: boolean;
  }>;
  countryRules: Array<{
    countryCode: string;
    enabled: boolean | null;
    trialDays: number | null;
    requirePaymentMethod: boolean | null;
    reason: string;
  }>;
  plans: Array<{
    code: string;
    name: string;
    active: boolean;
    trialEnabled: boolean;
    trialDays: number;
  }>;
};

export const getTrialLifecycleAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    unwrap<TrialLifecycleAdmin>(
      await context.supabase.rpc("platform_get_trial_lifecycle" as never),
    ),
  );

export const setTrialLifecyclePolicy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        enabled: z.boolean(),
        defaultDays: z.number().int().min(1).max(365),
        requirePaymentMethod: z.boolean(),
        firstTimeOnly: z.boolean(),
        allowReuse: z.boolean(),
        allowManualGrant: z.boolean(),
        readOnlyAfterExpiry: z.boolean(),
        reason: z.string().trim().min(3).max(1000),
      })
      .parse(v),
  )
  .handler(async ({ context, data }) =>
    unwrap<{ ok: true; version: number }>(
      await context.supabase.rpc(
        "platform_set_trial_lifecycle_policy" as never,
        {
          _enabled: data.enabled,
          _default_days: data.defaultDays,
          _require_payment_method: data.requirePaymentMethod,
          _first_time_only: data.firstTimeOnly,
          _allow_reuse: data.allowReuse,
          _allow_manual_grant: data.allowManualGrant,
          _read_only_after_expiry: data.readOnlyAfterExpiry,
          _reason: data.reason,
        } as never,
      ),
    ),
  );

export const setTrialReminderConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        kind: z.enum(["welcome", "d7", "d3", "d1", "expired"]),
        enabled: z.boolean(),
        emailEnabled: z.boolean(),
        inappEnabled: z.boolean(),
        reason: z.string().trim().min(3).max(1000),
      })
      .parse(v),
  )
  .handler(async ({ context, data }) =>
    unwrap<{ ok: true; kind: string }>(
      await context.supabase.rpc(
        "platform_set_trial_reminder_config" as never,
        {
          _kind: data.kind,
          _enabled: data.enabled,
          _email_enabled: data.emailEnabled,
          _inapp_enabled: data.inappEnabled,
          _reason: data.reason,
        } as never,
      ),
    ),
  );

export const setTrialCountryRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        countryCode: z.string().trim().length(2),
        enabled: z.boolean().nullable(),
        trialDays: z.number().int().min(1).max(365).nullable(),
        requirePaymentMethod: z.boolean().nullable(),
        reason: z.string().trim().min(3).max(1000),
      })
      .parse(v),
  )
  .handler(async ({ context, data }) =>
    unwrap<{ ok: true; countryCode: string }>(
      await context.supabase.rpc(
        "platform_set_trial_country_rule" as never,
        {
          _country_code: data.countryCode.toUpperCase(),
          _enabled: data.enabled,
          _trial_days: data.trialDays,
          _require_payment_method: data.requirePaymentMethod,
          _reason: data.reason,
        } as never,
      ),
    ),
  );

export type CompanyTrialDetail = {
  company: {
    id: string;
    name: string;
    countryCode: string | null;
    timezone: string;
  };
  subscription: {
    planCode: string;
    status: string;
    provider: string;
    trialStartedAt: string | null;
    trialEndsAt: string | null;
    remainingDays: number | null;
  } | null;
  resolvedPolicy: {
    enabled: boolean;
    days: number;
    requirePaymentMethod: boolean;
    allowManualGrant: boolean;
    policyVersion: number;
  };
  extensions: Array<{
    id: string;
    previousEndsAt: string | null;
    newEndsAt: string;
    daysAdded: number | null;
    reason: string;
    notes: string;
    createdAt: string;
  }>;
  reminders: Array<{
    id: string;
    kind: string;
    dueAt: string;
    status: string;
    attempts: number;
    sentAt: string | null;
    lastError: string | null;
  }>;
};

export const getCompanyTrialDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => z.object({ companyId: z.string().uuid() }).parse(v))
  .handler(async ({ context, data }) =>
    unwrap<CompanyTrialDetail>(
      await context.supabase.rpc(
        "platform_company_trial_detail" as never,
        { _company_id: data.companyId } as never,
      ),
    ),
  );
