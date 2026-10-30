import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertUuid } from "@/lib/company-validation";
import {
  hasPlatformScope, isPlatformRole, requirePlatformScope, validateReason,
  type PlatformRole,
} from "@/lib/platform-admin/security";

type OrganisationRow = {
  id: string; name: string; legal_name: string | null; country_code: string;
  base_currency: string; is_demo: boolean; created_at: string; archived_at: string | null;
};
type SubscriptionRow = {
  company_id: string; plan_code: string; status: string; billing_interval: string;
  currency: string; provider: string; current_period_end: string | null;
};
export type PlatformOrganisation = OrganisationRow & {
  subscription: SubscriptionRow | null;
};
export type PlatformCheckout = {
  id: string; company_id: string; plan_code: string; billing_interval: string;
  currency: string; unit_amount_minor: number; provider: string;
  status: string; created_at: string;
};
export type PlatformPlan = {
  code: string; name: string; audience: string; is_active: boolean;
  is_public: boolean; users_included: number; monthly_usd: number;
  monthly_gbp: number; monthly_inr: number; sort_order: number;
};
export type PlatformAuditRecord = {
  id: string; actor_user_id: string | null; action: string;
  entity_type: string; entity_id: string; reason: string | null;
  created_at: string;
};
export type PlatformStaff = { user_id: string; role: PlatformRole; created_at: string };

function ensurePage(value: unknown): number {
  const num = Number(value);
  return Number.isSafeInteger(num) && num >= 0 && num <= 10000 ? num : 0;
}
function ensureSearch(value: unknown): string {
  // Avoid PostgREST filter syntax and wildcard injection.
  return (typeof value === "string" ? value : "").trim().replace(/[%,()_*\\]/g, "").slice(0, 80);
}

export const getPlatformAdminIdentity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ role: PlatformRole | null; mfaReady: boolean }> => {
    const { data, error } = await context.supabase.rpc("platform_role" as never);
    if (error) throw new Error(error.message);
    return {
      role: isPlatformRole(data) ? data : null,
      mfaReady: context.claims?.aal === "aal2",
    };
  });

export const getPlatformOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requirePlatformScope(context.supabase, context.claims, "overview");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [orgs, liveOrgs, users, active, trials, checkouts] = await Promise.all([
      supabaseAdmin.from("companies").select("id", { head: true, count: "exact" }),
      supabaseAdmin.from("companies").select("id", { head: true, count: "exact" }).eq("is_demo", false),
      supabaseAdmin.from("profiles").select("id", { head: true, count: "exact" }),
      supabaseAdmin.from("company_subscriptions" as never).select("company_id" as never, { head: true, count: "exact" }).eq("status" as never, "active" as never),
      supabaseAdmin.from("company_subscriptions" as never).select("company_id" as never, { head: true, count: "exact" }).eq("status" as never, "trialing" as never),
      supabaseAdmin.from("billing_checkouts" as never).select("id" as never, { head: true, count: "exact" }),
    ]);
    for (const result of [orgs, liveOrgs, users, active, trials, checkouts]) {
      if (result.error) throw new Error(result.error.message);
    }
    return {
      organisations: orgs.count ?? 0,
      liveOrganisations: liveOrgs.count ?? 0,
      users: users.count ?? 0,
      activeSubscriptions: active.count ?? 0,
      trials: trials.count ?? 0,
      checkoutAttempts: checkouts.count ?? 0,
      capturedAt: new Date().toISOString(),
    };
  });

export const listPlatformOrganisations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { page?: number; search?: string }) => ({
    page: ensurePage(input?.page), search: ensureSearch(input?.search),
  }))
  .handler(async ({ context, data }) => {
    await requirePlatformScope(context.supabase, context.claims, "organisations");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const pageSize = 25;
    let query = supabaseAdmin.from("companies")
      .select("id, name, legal_name, country_code, base_currency, is_demo, created_at, archived_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(data.page * pageSize, (data.page + 1) * pageSize - 1);
    if (data.search) query = query.ilike("name", "%" + data.search + "%");
    const { data: companies, count, error } = await query;
    if (error) throw new Error(error.message);
    const records = (companies ?? []) as OrganisationRow[];
    const ids = records.map((c) => c.id);
    let subscriptions: SubscriptionRow[] = [];
    if (ids.length > 0) {
      const response = await supabaseAdmin.from("company_subscriptions" as never)
        .select("company_id, plan_code, status, billing_interval, currency, provider, current_period_end" as never)
        .in("company_id" as never, ids as never);
      if (response.error) throw new Error(response.error.message);
      subscriptions = (response.data ?? []) as unknown as SubscriptionRow[];
    }
    const byCompany = new Map(subscriptions.map((sub) => [sub.company_id, sub]));
    return {
      rows: records.map((company): PlatformOrganisation => ({
        ...company, subscription: byCompany.get(company.id) ?? null,
      })),
      count: count ?? 0, page: data.page, pageSize,
    };
  });

export const listPlatformBilling = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requirePlatformScope(context.supabase, context.claims, "billing");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [plans, checkouts, events, settings] = await Promise.all([
      supabaseAdmin.from("billing_plans" as never)
        .select("code, name, audience, is_active, is_public, users_included, monthly_usd, monthly_gbp, monthly_inr, sort_order" as never)
        .order("sort_order" as never),
      supabaseAdmin.from("billing_checkouts" as never)
        .select("id, company_id, plan_code, billing_interval, currency, unit_amount_minor, provider, status, created_at" as never)
        .order("created_at" as never, { ascending: false }).limit(75),
      supabaseAdmin.from("billing_events" as never)
        .select("id, company_id, provider, event_type, created_at" as never)
        .order("created_at" as never, { ascending: false }).limit(50),
      supabaseAdmin.from("billing_settings" as never)
        .select("trial_days, trial_plan_code, annual_free_months, past_due_grace_days, card_required, require_owner_approval" as never)
        .maybeSingle(),
    ]);
    for (const result of [plans, checkouts, events, settings]) {
      if (result.error) throw new Error(result.error.message);
    }
    return {
      plans: (plans.data ?? []) as unknown as PlatformPlan[],
      checkouts: (checkouts.data ?? []) as unknown as PlatformCheckout[],
      events: (events.data ?? []) as unknown as Array<{ id: string; company_id: string | null; provider: string; event_type: string; created_at: string }>,
      settings: settings.data as { trial_days: number; trial_plan_code: string; annual_free_months: number; past_due_grace_days: number; card_required: boolean; require_owner_approval: boolean } | null,
    };
  });

export const listPlatformAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlatformAuditRecord[]> => {
    await requirePlatformScope(context.supabase, context.claims, "audit");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("platform_billing_audit" as never)
      .select("id, actor_user_id, action, entity_type, entity_id, reason, created_at" as never)
      .order("created_at" as never, { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as PlatformAuditRecord[];
  });

export const listPlatformStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PlatformStaff[]> => {
    await requirePlatformScope(context.supabase, context.claims, "audit");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("platform_roles" as never)
      .select("user_id, role, created_at" as never).order("created_at" as never);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as PlatformStaff[];
  });

export const updatePlatformPlanVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { code: string; isPublic: boolean; reason: string }) => {
    const code = typeof input?.code === "string" ? input.code.trim() : "";
    if (!/^[a-z][a-z0-9_-]{1,39}$/.test(code)) throw new Error("Invalid plan code.");
    if (typeof input?.isPublic !== "boolean") throw new Error("Invalid visibility.");
    return { code, isPublic: input.isPublic, reason: validateReason(input?.reason) };
  })
  .handler(async ({ data, context }) => {
    await requirePlatformScope(context.supabase, context.claims, "manage");
    const { error } = await context.supabase.rpc(
      "platform_set_plan_visibility" as never,
      { _plan_code: data.code, _is_public: data.isPublic, _reason: data.reason } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updatePlatformStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; role: "platform_finance" | "platform_support" | null; reason: string }) => {
    if (input?.role !== null && input?.role !== "platform_finance" && input?.role !== "platform_support") {
      throw new Error("Only platform finance or support roles may be delegated.");
    }
    return { userId: assertUuid(input?.userId), role: input.role, reason: validateReason(input?.reason) };
  })
  .handler(async ({ data, context }) => {
    await requirePlatformScope(context.supabase, context.claims, "manage");
    if (data.userId === context.userId) throw new Error("You cannot modify your own platform role.");
    const { error } = await context.supabase.rpc(
      "platform_set_staff_role" as never,
      { _user_id: data.userId, _role: data.role, _reason: data.reason } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
