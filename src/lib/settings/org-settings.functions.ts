import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import type { CompanyRole } from "@/lib/company-constants";
import { normaliseAdjustments, type AccessAdjustment } from "@/lib/access-catalogue";
import { normalizeCurrencySelection } from "@/lib/settings/currency-selection";
import type { BrandingSnapshot, LocalisationSnapshot, SequenceSnapshot } from "@/lib/settings/legacy-snapshots";

const DOCUMENT_TYPES = [
  "sales_invoice",
  "purchase_bill",
  "sales_quote",
  "sales_credit_note",
  "purchase_credit_note",
] as const;

const LOCALES = ["en-GB", "en-US", "en-AU", "en-NZ", "en-IE", "en-CA"] as const;
const DATE_FORMATS = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"] as const;

async function audit(
  supabase: {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ error: { message: string } | null }>;
  },
  companyId: string,
  action: string,
  entityType: string,
  entityId: string | null,
  details: Record<string, unknown>,
) {
  await supabase.rpc("record_audit_event", {
    _company_id: companyId,
    _action: action,
    _entity_type: entityType,
    _entity_id: entityId,
    _details: details,
  });
}

export const getOrgExtendedSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: assertUuid(input.companyId) }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    const { data: company, error } = await context.supabase
      .from("companies" as never)
      .select(
        "locale, date_format, invoice_footer, document_theme_color, base_currency, is_demo" as never,
      )
      .eq("id" as never, data.companyId as never)
      .maybeSingle();
    if (error) throw new Error(error.message);

    const { data: branding, error: brandingError } = await context.supabase
      .from("company_branding" as never)
      .select("trading_name, letterhead_line, invoice_email, invoice_phone, logo_url" as never)
      .eq("company_id" as never, data.companyId as never)
      .maybeSingle();

    const { data: sequences, error: sequencesError } = await context.supabase
      .from("document_sequences" as never)
      .select("document_type, prefix, next_number, padding" as never)
      .eq("company_id" as never, data.companyId as never)
      .order("document_type" as never);

    const { data: currencies, error: currenciesError } = await context.supabase
      .from("company_currencies" as never)
      .select("currency_code" as never)
      .eq("company_id" as never, data.companyId as never);

    const { data: rates, error: ratesError } = await context.supabase
      .from("exchange_rates" as never)
      .select(
        "id, from_currency, to_currency, rate_date, rate, note, voided_at, created_at" as never,
      )
      .eq("company_id" as never, data.companyId as never)
      .order("rate_date" as never, { ascending: false })
      .limit(50);

    for (const loadError of [brandingError, sequencesError, currenciesError, ratesError]) {
      if (loadError) throw new Error(loadError.message);
    }

    return {
      company: company as {
        locale: string;
        date_format: string;
        invoice_footer: string;
        document_theme_color: string;
        base_currency: string;
        is_demo: boolean;
      } | null,
      branding: (branding as {
        trading_name: string | null;
        letterhead_line: string | null;
        invoice_email: string | null;
        invoice_phone: string | null;
        logo_url: string | null;
      } | null) ?? {
        trading_name: null,
        letterhead_line: null,
        invoice_email: null,
        invoice_phone: null,
        logo_url: null,
      },
      sequences: (sequences ?? []) as Array<{
        document_type: string;
        prefix: string;
        next_number: number;
        padding: number;
      }>,
      enabledCurrencies: ((currencies ?? []) as Array<{ currency_code: string }>).map(
        (c) => c.currency_code,
      ),
      exchangeRates: (rates ?? []) as Array<{
        id: string;
        from_currency: string;
        to_currency: string;
        rate_date: string;
        rate: number;
        note: string | null;
        voided_at: string | null;
        created_at: string;
      }>,
      documentTypes: [...DOCUMENT_TYPES],
      locales: [...LOCALES],
      dateFormats: [...DATE_FORMATS],
    };
  });

export const updateLocalization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      expected: LocalisationSnapshot;
      locale: string;
      date_format: string;
      invoice_footer: string;
      document_theme_color: string;
    }) => {
      if (!LOCALES.includes(input.locale as (typeof LOCALES)[number])) {
        throw new Error("Unsupported locale");
      }
      if (!DATE_FORMATS.includes(input.date_format as (typeof DATE_FORMATS)[number])) {
        throw new Error("Unsupported date format");
      }
      const color = input.document_theme_color.trim();
      if (!/^#[0-9A-Fa-f]{6}$/.test(color)) throw new Error("Theme colour must be #RRGGBB");
      if (input.invoice_footer.length > 2000) throw new Error("Invoice footer is too long");
      return {
        companyId: assertUuid(input.companyId),
        expected: input.expected,
        desired: {
          locale: input.locale,
          date_format: input.date_format,
          invoice_footer: input.invoice_footer,
          document_theme_color: color,
        },
      };
    },
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "company.settings.edit");
    const { data: saved, error } = await context.supabase.rpc(
      "save_company_localisation_if_unchanged" as never,
      {
        _company_id: data.companyId,
        _expected: data.expected,
        _desired: data.desired,
      } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true, saved };
  });

export const upsertBranding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      expected: BrandingSnapshot;
      trading_name: string;
      letterhead_line: string;
      invoice_email: string;
      invoice_phone: string;
      logo_url: string;
    }) => {
      const trimmed = {
        trading_name: input.trading_name.trim(),
        letterhead_line: input.letterhead_line.trim(),
        invoice_email: input.invoice_email.trim(),
        invoice_phone: input.invoice_phone.trim(),
        logo_url: input.logo_url.trim(),
      };
      if (
        trimmed.trading_name.length > 160 ||
        trimmed.letterhead_line.length > 200 ||
        trimmed.invoice_email.length > 160 ||
        trimmed.invoice_phone.length > 40 ||
        trimmed.logo_url.length > 500
      ) {
        throw new Error("Branding field exceeds its allowed length");
      }
      if (trimmed.invoice_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed.invoice_email)) {
        throw new Error("Invoice email is invalid");
      }
      if (trimmed.logo_url && !/^https:\/\//i.test(trimmed.logo_url)) {
        throw new Error("Logo URL must begin with HTTPS");
      }
      return {
        companyId: assertUuid(input.companyId),
        expected: input.expected,
        desired: {
          trading_name: trimmed.trading_name || null,
          letterhead_line: trimmed.letterhead_line || null,
          invoice_email: trimmed.invoice_email || null,
          invoice_phone: trimmed.invoice_phone || null,
          logo_url: trimmed.logo_url || null,
        },
      };
    },
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "company.settings.edit");
    const { data: saved, error } = await context.supabase.rpc(
      "save_company_branding_if_unchanged" as never,
      {
        _company_id: data.companyId,
        _expected: data.expected,
        _desired: data.desired,
      } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true, saved };
  });

export const updateDocumentSequence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      expected: SequenceSnapshot;
      document_type: string;
      prefix: string;
      next_number: number;
      padding: number;
    }) => {
      if (!(DOCUMENT_TYPES as readonly string[]).includes(input.document_type)) {
        throw new Error("Unknown document type");
      }
      if (!Number.isSafeInteger(input.next_number) || input.next_number < 1 ||
          input.next_number >= 2147483647) {
        throw new Error("Next number must be an integer between 1 and 2147483646");
      }
      if (!Number.isInteger(input.padding) || input.padding < 1 || input.padding > 10) {
        throw new Error("Padding must be an integer between 1 and 10");
      }
      const prefix = input.prefix.trim();
      if (prefix.length > 20) throw new Error("Prefix must be 20 characters or fewer");
      return {
        companyId: assertUuid(input.companyId),
        document_type: input.document_type,
        expected: input.expected,
        desired: { prefix, next_number: input.next_number, padding: input.padding },
      };
    },
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "company.settings.edit");
    const { data: saved, error } = await context.supabase.rpc(
      "save_document_sequence_if_unchanged" as never,
      {
        _company_id: data.companyId,
        _document_type: data.document_type,
        _expected: data.expected,
        _desired: data.desired,
      } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true, saved };
  });

export const setEnabledCurrencies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { companyId: string; currencies: string[]; expectedCurrencies: string[] }) => ({
      companyId: assertUuid(input.companyId),
      currencies: normalizeCurrencySelection(input.currencies, { enforceSupported: true }),
      expectedCurrencies: normalizeCurrencySelection(input.expectedCurrencies),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "company.settings.edit");

    // This RPC is the sole write path. Do not fall back to delete-then-insert:
    // the old multi-request implementation could lose the original list.
    const { data: saved, error } = await context.supabase.rpc(
      "replace_company_currencies_atomic" as never,
      {
        _company_id: data.companyId,
        _currencies: data.currencies,
        _expected_currencies: data.expectedCurrencies,
      } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true, currencies: saved as string[] };
  });

export const createExchangeRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      from_currency: string;
      to_currency: string;
      rate_date: string;
      rate: number | string;
      note?: string;
    }) => {
      const from = (input.from_currency ?? "").toUpperCase();
      const to = (input.to_currency ?? "").toUpperCase();
      if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) throw new Error("Invalid currency");
      if (from === to) throw new Error("Currencies must differ");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.rate_date ?? ""))
        throw new Error("rate_date must be YYYY-MM-DD");
      const rate = Number(input.rate);
      if (!Number.isFinite(rate) || rate <= 0) throw new Error("Rate must be positive");
      return {
        companyId: assertUuid(input.companyId),
        from_currency: from,
        to_currency: to,
        rate_date: input.rate_date,
        rate,
        note: (input.note ?? "").trim().slice(0, 200) || null,
      };
    },
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "company.settings.edit");
    const { data: row, error } = await context.supabase
      .from("exchange_rates" as never)
      .insert({
        company_id: data.companyId,
        from_currency: data.from_currency,
        to_currency: data.to_currency,
        rate_date: data.rate_date,
        rate: data.rate,
        note: data.note,
        created_by: context.userId,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const id = (row as { id: string }).id;
    await audit(
      context.supabase as never,
      data.companyId,
      "exchange_rate.create",
      "exchange_rate",
      id,
      {
        from: data.from_currency,
        to: data.to_currency,
        rate_date: data.rate_date,
        rate: data.rate,
      },
    );
    return { id };
  });

export const voidExchangeRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { rateId: string }) => ({ rateId: assertUuid(input.rateId, "rate") }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc(
      "void_exchange_rate" as never,
      {
        _rate_id: data.rateId,
      } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; userId: string; role: CompanyRole }) => {
    const allowed: CompanyRole[] = [
      "owner",
      "admin",
      "accountant",
      "bookkeeper",
      "staff",
      "read_only",
    ];
    if (!allowed.includes(input.role)) throw new Error("Invalid role");
    return {
      companyId: assertUuid(input.companyId),
      userId: assertUuid(input.userId, "user"),
      role: input.role,
    };
  })
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "members.manage");
    if (data.role === "owner") {
      await assertCompanyPermission(context.supabase, data.companyId, "members.grant_owner");
    }

    const { data: target } = await context.supabase
      .from("company_members")
      .select("role")
      .eq("company_id", data.companyId)
      .eq("user_id", data.userId)
      .maybeSingle();
    if (!target) throw new Error("Member not found");

    if (target.role === "owner" && data.role !== "owner") {
      const { count } = await context.supabase
        .from("company_members")
        .select("user_id", { count: "exact", head: true })
        .eq("company_id", data.companyId)
        .eq("role", "owner")
        .eq("status", "active");
      if ((count ?? 0) <= 1) throw new Error("Cannot remove the last owner");
    }

    const { data: updated, error } = await context.supabase
      .from("company_members")
      .update({ role: data.role })
      .eq("company_id", data.companyId)
      .eq("user_id", data.userId)
      .select("user_id");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) {
      throw new Error("That person's role could not be changed.");
    }

    await audit(
      context.supabase as never,
      data.companyId,
      "members.role_change",
      "company_member",
      data.userId,
      {
        from: target.role,
        to: data.role,
      },
    );
    return { ok: true };
  });

export const resetDemoCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: assertUuid(input.companyId) }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "demo.reset");
    const { data: company } = await context.supabase
      .from("companies")
      .select("is_demo")
      .eq("id", data.companyId)
      .maybeSingle();
    if (!company?.is_demo) throw new Error("Only Demo Company can be reset");
    const { error } = await context.supabase.rpc(
      "reset_demo_company" as never,
      {
        _company_id: data.companyId,
      } as never,
    );
    if (error) throw new Error(error.message);
    const { seedDemoCompanyData } = await import("@/lib/demo/seed-demo");
    const seeded = await seedDemoCompanyData(context.supabase, {
      companyId: data.companyId,
      userId: context.userId,
    });
    return { ok: true, ...seeded };
  });

export const listCompanyAuditEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      limit?: number;
      offset?: number;
      action?: string;
      entityType?: string;
      fromDate?: string;
      toDate?: string;
    }) => ({
      companyId: assertUuid(input.companyId),
      limit: Math.min(Math.max(Number(input.limit) || 50, 1), 200),
      offset: Math.max(0, Number(input.offset) || 0),
      action: (input.action ?? "").trim().slice(0, 80),
      entityType: (input.entityType ?? "").trim().slice(0, 80),
      fromDate: (input.fromDate ?? "").slice(0, 10),
      toDate: (input.toDate ?? "").slice(0, 10),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "audit.view");
    let q = context.supabase
      .from("audit_events" as never)
      .select("id, action, entity_type, entity_id, details, actor_user_id, created_at" as never)
      .eq("company_id" as never, data.companyId as never)
      .order("created_at" as never, { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (data.action) q = q.ilike("action" as never, `%${data.action}%` as never);
    if (data.entityType) q = q.eq("entity_type" as never, data.entityType as never);
    if (data.fromDate) q = q.gte("created_at" as never, `${data.fromDate}T00:00:00.000Z` as never);
    if (data.toDate) q = q.lte("created_at" as never, `${data.toDate}T23:59:59.999Z` as never);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (
      (rows ?? []) as Array<{
        id: string;
        action: string;
        entity_type: string;
        entity_id: string | null;
        details: unknown;
        actor_user_id: string | null;
        created_at: string;
      }>
    ).map((r) => ({
      id: r.id,
      action: r.action,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      details_json: JSON.stringify(r.details ?? {}),
      actor_user_id: r.actor_user_id,
      created_at: r.created_at,
    }));
  });

export const listCompanyInvitations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: assertUuid(input.companyId) }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "members.manage");
    const { data: rows, error } = await context.supabase
      .from("company_invitations" as never)
      .select("id, email, role, expires_at, accepted_at, revoked_at, created_at" as never)
      .eq("company_id" as never, data.companyId as never)
      .order("created_at" as never, { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    const now = Date.now();
    return (
      (rows ?? []) as Array<{
        id: string;
        email: string;
        role: string;
        expires_at: string;
        accepted_at: string | null;
        revoked_at: string | null;
        created_at: string;
      }>
    ).map((r) => {
      let status: "pending" | "accepted" | "expired" | "revoked" = "pending";
      if (r.revoked_at) status = "revoked";
      else if (r.accepted_at) status = "accepted";
      else if (new Date(r.expires_at).getTime() < now) status = "expired";
      return { ...r, status, emailDelivery: "unavailable" as const };
    });
  });

export const createCompanyInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      email: string;
      role: CompanyRole;
      adjustments?: AccessAdjustment[];
    }) => {
      const email = (input.email ?? "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email");
      const allowed: CompanyRole[] = ["admin", "accountant", "bookkeeper", "staff", "read_only"];
      if (!allowed.includes(input.role))
        throw new Error("Ownership is transferred by an owner, not by invitation");
      return {
        companyId: assertUuid(input.companyId),
        email: email.slice(0, 160),
        role: input.role,
        adjustments: normaliseAdjustments(input.role, input.adjustments ?? []),
      };
    },
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "members.manage");
    const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
    const token = Array.from(tokenBytes, (b) => b.toString(16).padStart(2, "0")).join("");
    const tokenHash = await sha256Hex(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: id, error } = await context.supabase.rpc(
      "issue_company_invitation" as never,
      {
        _company_id: data.companyId,
        _email: data.email,
        _role: data.role,
        _token_hash: tokenHash,
        _expires_at: expiresAt,
        _adjustments: data.adjustments,
      } as never,
    );
    if (error) throw new Error(error.message);
    return {
      id: String(id),
      email: data.email,
      role: data.role,
      expiresAt,
      inviteToken: token,
      emailDelivery: "unavailable" as const,
      message:
        "Invitation recorded. Outbound email is not configured — copy the link and send it to them.",
    };
  });

export const revokeCompanyInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; invitationId: string }) => ({
    companyId: assertUuid(input.companyId),
    invitationId: assertUuid(input.invitationId),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "members.manage");
    const { error } = await context.supabase.rpc(
      "revoke_company_invitation" as never,
      {
        _company_id: data.companyId,
        _invitation_id: data.invitationId,
      } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
