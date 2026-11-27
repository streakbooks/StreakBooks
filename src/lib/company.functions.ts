import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CompanyRole } from "@/lib/company-constants";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import {
  assertUuid,
  validateCompanyInput,
  validateTaxRegime,
  type CreateCompanyInput,
} from "@/lib/company-validation";
import { permissionsForRole, type Permission } from "@/lib/permissions";

export type { CreateCompanyInput } from "@/lib/company-validation";

export type CompanySummary = {
  id: string;
  name: string;
  legal_name: string | null;
  country_code: string;
  base_currency: string;
  fiscal_year_end_month: number;
  fiscal_year_end_day: number;
  timezone: string;
  is_demo: boolean;
  archived_at: string | null;
  /** Display preferences (U-08). Null falls back to en-GB. */
  locale?: string | null;
  date_format?: string | null;
  role: CompanyRole;
  /** True when this user entered the company through an active firm staff grant. */
  firm_access?: boolean;
  permissions?: Permission[];
};

export type CompanyContext = {
  companies: CompanySummary[];
  activeCompanyId: string | null;
};

/**
 * Companies the signed-in user is an active member of, plus the resolved
 * active company. Row-level security returns only the caller's companies.
 */
export const getCompanyContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CompanyContext> => {
    const { supabase, userId } = context;

    const { data: rows, error } = await supabase.rpc("platform_company_context" as never);
    if (error) throw new Error(error.message);
    const companies = (rows ?? []) as unknown as CompanySummary[];

    // locale / date_format are display preferences (U-08); a failure here must not block the app.
    if (companies.length > 0) {
      const { data: prefs } = await supabase
        .from("companies" as never)
        .select("id, locale, date_format" as never)
        .in("id" as never, companies.map((c) => c.id) as never);
      const byId = new Map(
        (
          (prefs ?? []) as unknown as Array<{
            id: string;
            locale: string | null;
            date_format: string | null;
          }>
        ).map((p) => [p.id, p]),
      );
      for (const c of companies) {
        const p = byId.get(c.id);
        c.locale = p?.locale ?? null;
        c.date_format = p?.date_format ?? null;
      }
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("last_company_id")
      .eq("id", userId)
      .maybeSingle();

    const remembered = profile?.last_company_id ?? null;
    const active =
      companies.find((c) => c.id === remembered) ??
      companies.find((c) => !c.is_demo) ??
      companies[0] ??
      null;

    return { companies, activeCompanyId: active?.id ?? null };
  });

export const setActiveCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: assertUuid(input?.companyId) }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Membership check (server) + DB trigger as defence in depth.
    await assertCompanyMember(supabase, data.companyId);
    const { error } = await supabase
      .from("profiles")
      .update({ last_company_id: data.companyId })
      .eq("id", userId);
    if (error) throw new Error("You do not have access to that company.");
    return { ok: true };
  });

export const createCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validateCompanyInput)
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("create_company", {
      _name: data.name,
      _country_code: data.country_code,
      _base_currency: data.base_currency,
      _fy_end_month: data.fiscal_year_end_month,
      _fy_end_day: data.fiscal_year_end_day,
      _timezone: data.timezone,
      _legal_name: data.legal_name ?? "",
    });
    if (error) throw new Error(error.message);
    return { id: id as string };
  });

export const openDemoCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: id, error } = await context.supabase.rpc("create_demo_company");
    if (error) throw new Error(error.message);
    const companyId = id as string;
    // Seed sample ledger through PostingEngine when empty (idempotent).
    const { seedDemoCompanyData } = await import("@/lib/demo/seed-demo");
    const { count } = await context.supabase
      .from("journals" as never)
      .select("id" as never, { count: "exact", head: true })
      .eq("company_id" as never, companyId as never);
    if ((count ?? 0) === 0) {
      // Must succeed — empty Demo ledgers look like a broken accounting engine
      await seedDemoCompanyData(context.supabase, {
        companyId,
        userId: context.userId,
      });
      const { seedDemoModules } = await import("@/lib/demo/seed-demo-modules");
      await seedDemoModules(context.supabase, companyId).catch((error: unknown) => {
        console.warn("[demo seed] modules:", error instanceof Error ? error.message : error);
      });
    }
    return { id: companyId };
  });

export type CompanyDetails = CompanySummary & {
  tax: {
    tax_regime: string;
    registration_number: string | null;
    prices_include_tax: boolean;
    filing_frequency: string | null;
  } | null;
};

export const getCompanyDetails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: assertUuid(input?.companyId) }))
  .handler(async ({ data, context }): Promise<CompanyDetails> => {
    const { supabase, userId } = context;
    await assertCompanyMember(supabase, data.companyId);
    const { data: row, error } = await supabase
      .from("companies")
      .select(
        "id, name, legal_name, country_code, base_currency, fiscal_year_end_month, fiscal_year_end_day, timezone, is_demo, archived_at, company_tax_settings(tax_regime, registration_number, prices_include_tax, filing_frequency)",
      )
      .eq("id", data.companyId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Company not found or you do not have access.");

    const { data: me } = await supabase
      .from("company_members")
      .select("role")
      .eq("company_id", data.companyId)
      .eq("user_id", userId)
      .maybeSingle();

    const { company_tax_settings, ...rest } = row as typeof row & {
      company_tax_settings: CompanyDetails["tax"] | CompanyDetails["tax"][];
    };
    const tax = Array.isArray(company_tax_settings)
      ? (company_tax_settings[0] ?? null)
      : company_tax_settings;
    return {
      ...(rest as Omit<CompanySummary, "role">),
      role: (me?.role ?? "read_only") as CompanyRole,
      tax,
    };
  });

export const updateCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (
      input: CreateCompanyInput & {
        companyId: string;
        expected: Omit<CreateCompanyInput, "legal_name"> & {
          legal_name: string | null;
          tax_regime: string;
          registration_number: string | null;
          prices_include_tax: boolean;
        };
        tax_regime: string;
        registration_number: string;
        prices_include_tax: boolean;
      },
    ) => {
      const base = validateCompanyInput(input);
      if (!input.expected || typeof input.expected !== "object") {
        throw new Error("Reload organisation settings before saving.");
      }
      if (typeof input.expected.prices_include_tax !== "boolean") {
        throw new Error("Reload organisation settings before saving.");
      }
      const expectedCompany = validateCompanyInput({
        ...input.expected,
        legal_name: input.expected.legal_name ?? "",
      });
      return {
        ...base,
        companyId: assertUuid(input.companyId),
        expected: {
          ...expectedCompany,
          legal_name: expectedCompany.legal_name || null,
          tax_regime: validateTaxRegime(input.expected.tax_regime),
          registration_number: input.expected.registration_number?.trim() || null,
          prices_include_tax: input.expected.prices_include_tax,
        },
        tax_regime: validateTaxRegime(input.tax_regime),
        registration_number: (input.registration_number ?? "").trim().slice(0, 60),
        prices_include_tax: Boolean(input.prices_include_tax),
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertCompanyPermission(supabase, data.companyId, "company.settings.edit");
    if (
      data.tax_regime !== data.expected.tax_regime ||
      (data.registration_number || null) !== data.expected.registration_number ||
      data.prices_include_tax !== data.expected.prices_include_tax
    ) {
      await assertCompanyPermission(supabase, data.companyId, "tax.settings");
    }
    const { data: result, error } = await supabase.rpc(
      "save_company_identity_and_tax" as never,
      {
        _company_id: data.companyId,
        _expected: data.expected,
        _desired: {
          name: data.name,
          legal_name: data.legal_name || null,
          country_code: data.country_code,
          base_currency: data.base_currency,
          fiscal_year_end_month: data.fiscal_year_end_month,
          fiscal_year_end_day: data.fiscal_year_end_day,
          timezone: data.timezone,
          tax_regime: data.tax_regime,
          registration_number: data.registration_number || null,
          prices_include_tax: data.prices_include_tax,
        },
      } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true, result };
  });

export type CompanyMember = {
  user_id: string;
  role: CompanyRole;
  status: string;
  full_name: string;
  email: string;
  is_you: boolean;
};

export const listCompanyMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: assertUuid(input?.companyId) }))
  .handler(async ({ data, context }): Promise<CompanyMember[]> => {
    const { supabase, userId } = context;
    await assertCompanyPermission(supabase, data.companyId, "members.view");
    const { data: rows, error } = await supabase
      .from("company_members")
      .select("user_id, role, status")
      .eq("company_id", data.companyId)
      .order("created_at");
    if (error) throw new Error(error.message);
    const ids = (rows ?? []).map((r) => r.user_id);
    const { data: profiles } = ids.length
      ? await supabase.from("profiles").select("id, full_name, email").in("id", ids)
      : { data: [] as { id: string; full_name: string; email: string }[] };
    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
    return (rows ?? []).map((r) => ({
      user_id: r.user_id,
      role: r.role as CompanyRole,
      status: r.status,
      full_name: byId.get(r.user_id)?.full_name ?? "",
      email: byId.get(r.user_id)?.email ?? "",
      is_you: r.user_id === userId,
    }));
  });

/** Active-company role permissions for UI gating (RLS remains authoritative). */
export const getActiveCompanyPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{
      companyId: string | null;
      role: CompanyRole | null;
      permissions: Permission[];
    }> => {
      const { supabase, userId } = context;
      const { data: rows, error } = await supabase.rpc("platform_company_context" as never);
      if (error) throw new Error(error.message);
      const companies = (rows ?? []) as unknown as CompanySummary[];

      const { data: profile } = await supabase
        .from("profiles")
        .select("last_company_id")
        .eq("id", userId)
        .maybeSingle();

      const remembered = profile?.last_company_id ?? null;
      const active =
        companies.find((c) => c.id === remembered) ??
        companies.find((c) => !c.is_demo) ??
        companies[0] ??
        null;

      if (!active) return { companyId: null, role: null, permissions: [] };
      return {
        companyId: active.id,
        role: active.role,
        permissions: active.permissions ?? [...permissionsForRole(active.role)],
      };
    },
  );
