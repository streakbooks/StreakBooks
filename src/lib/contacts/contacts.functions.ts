import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import { isMissingFunctionError } from "@/lib/purchases/db-safety";
import { aggregateOutstanding } from "@/lib/contacts/balances";
import { buildIlikeOr, escapeLikeTerm } from "@/lib/purchases/search-terms";
import {
  buildContactsCsv,
  contactImportTemplateCsv,
  duplicateScore,
  parseContactsCsv,
  resolveContactSort,
} from "@/lib/contacts/contact-helpers";

const CONTACT_SELECT =
  "id, name, email, phone, tax_number, payment_terms_days, is_active, kind, created_at, updated_at, account_number, legal_name, website, default_currency, credit_limit_minor, notes, billing_address_line1, billing_city, billing_region, billing_postal, billing_country, delivery_address_line1, delivery_city, delivery_region, delivery_postal, delivery_country, archived_at";

type OpenDocClient = Parameters<typeof assertCompanyMember>[0];

/** All open (authorised / partly paid) invoices and bills - not a capped "latest N" sample. */
async function loadOpenDocs(supabase: OpenDocClient, companyId: string, contactId: string | null) {
  const cols = "currency_code, total_minor, amount_paid_minor, amount_credited_minor, due_date";
  const load = async (table: string) => {
    const rows: Array<{
      currency_code: string | null;
      total_minor: number;
      amount_paid_minor: number;
      amount_credited_minor: number;
      due_date: string | null;
    }> = [];
    for (let from = 0; ; from += 1000) {
      let q = supabase
        .from(table as never)
        .select(cols as never)
        .eq("company_id" as never, companyId as never)
        .in("status" as never, ["authorised", "partly_paid"] as never)
        .order("id" as never)
        .range(from, from + 999);
      if (contactId) q = q.eq("contact_id" as never, contactId as never);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      const page = (data ?? []) as unknown as typeof rows;
      rows.push(...page);
      if (page.length < 1000 || rows.length >= 50_000) break;
    }
    return rows;
  };
  const [recv, pay] = await Promise.all([load("sales_invoices"), load("purchase_bills")]);
  return { recv, pay };
}

export const listContacts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      kind?: string;
      q?: string;
      includeInactive?: boolean;
      view?: string;
      limit?: number;
      offset?: number;
      sort?: string;
    }) => ({
      companyId: assertUuid(input.companyId),
      kind: (input.kind ?? "all").trim(),
      q: (input.q ?? "").trim().slice(0, 100),
      includeInactive: Boolean(input.includeInactive),
      view: (input.view ?? "all").trim(),
      limit: Math.min(500, Math.max(1, Number(input.limit ?? 200) || 200)),
      offset: Math.min(1_000_000, Math.max(0, Math.floor(Number(input.offset ?? 0) || 0))),
      sort: (input.sort ?? "").trim().slice(0, 40),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    let q = context.supabase
      .from("contacts" as never)
      .select(CONTACT_SELECT as never)
      .eq("company_id" as never, data.companyId as never)
      .range(data.offset, data.offset + data.limit - 1);

    // Sort in Postgres before pagination, not just within the visible page.
    const order = resolveContactSort(data.sort, data.view);
    q = q.order(order.column as never, { ascending: order.ascending, nullsFirst: false });
    // Stable pagination even when two contacts share the same sort value.
    q = q.order("id" as never);

    if (data.view === "archived") {
      q = q.not("archived_at" as never, "is" as never, null as never);
    } else if (!data.includeInactive && data.view !== "inactive") {
      q = q.eq("is_active" as never, true as never).is("archived_at" as never, null as never);
    } else if (data.view === "inactive") {
      q = q.eq("is_active" as never, false as never).is("archived_at" as never, null as never);
    }

    if (data.kind === "customers" || data.view === "customers") {
      q = q.in("kind" as never, ["customer", "both"] as never);
    } else if (data.kind === "suppliers" || data.view === "suppliers") {
      q = q.in("kind" as never, ["supplier", "both"] as never);
    } else if (data.view === "both") {
      q = q.eq("kind" as never, "both" as never);
    }

    const search = buildIlikeOr(
      [
        "name",
        "email",
        "phone",
        "account_number",
        "tax_number",
        "legal_name",
        "billing_city",
        "billing_region",
        "billing_country",
      ],
      data.q,
    );
    if (search) q = q.or(search as never);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** Exact count for the same server-side directory filters; never infer total from a full page. */
export const countContacts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; kind?: string; q?: string; view?: string }) => ({
    companyId: assertUuid(input.companyId),
    kind: (input.kind ?? "all").trim(),
    q: (input.q ?? "").trim().slice(0, 100),
    view: (input.view ?? "all").trim(),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    let q = context.supabase
      .from("contacts" as never)
      .select("id" as never, { count: "exact", head: true })
      .eq("company_id" as never, data.companyId as never);

    if (data.view === "archived") {
      q = q.not("archived_at" as never, "is" as never, null as never);
    } else if (data.view === "inactive") {
      q = q.eq("is_active" as never, false as never).is("archived_at" as never, null as never);
    } else {
      q = q.eq("is_active" as never, true as never).is("archived_at" as never, null as never);
    }
    if (data.kind === "customers" || data.view === "customers") {
      q = q.in("kind" as never, ["customer", "both"] as never);
    } else if (data.kind === "suppliers" || data.view === "suppliers") {
      q = q.in("kind" as never, ["supplier", "both"] as never);
    } else if (data.view === "both") {
      q = q.eq("kind" as never, "both" as never);
    }
    const search = buildIlikeOr(
      [
        "name",
        "email",
        "phone",
        "account_number",
        "tax_number",
        "legal_name",
        "billing_city",
        "billing_region",
        "billing_country",
      ],
      data.q,
    );
    if (search) q = q.or(search as never);
    const { count, error } = await q;
    if (error) throw new Error(error.message);
    return { count: count ?? 0 };
  });

export const getContactsDirectorySummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({
    companyId: assertUuid(input.companyId),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);

    const { count: activeCount } = await context.supabase
      .from("contacts" as never)
      .select("id" as never, { count: "exact", head: true })
      .eq("company_id" as never, data.companyId as never)
      .eq("is_active" as never, true as never)
      .is("archived_at" as never, null as never);

    const { data: company } = await context.supabase
      .from("companies")
      .select("base_currency")
      .eq("id", data.companyId)
      .maybeSingle();
    const baseCurrency = (company?.base_currency ?? "GBP").toUpperCase();
    const { recv, pay } = await loadOpenDocs(context.supabase, data.companyId, null);
    const today = new Date().toISOString().slice(0, 10);
    const r = aggregateOutstanding(recv, today, baseCurrency);
    const p = aggregateOutstanding(pay, today, baseCurrency);

    return {
      activeContactCount: activeCount ?? 0,
      baseCurrency,
      // Headline figures are base-currency only; other currencies are listed separately.
      receivableMinor: r.base.outstandingMinor,
      payableMinor: p.base.outstandingMinor,
      overdueReceivableMinor: r.base.overdueMinor,
      overduePayableMinor: p.base.overdueMinor,
      receivableByCurrency: r.byCurrency,
      payableByCurrency: p.byCurrency,
    };
  });

export const getContact = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; contactId: string }) => ({
    companyId: assertUuid(input.companyId),
    contactId: assertUuid(input.contactId),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    const { data: row, error } = await context.supabase
      .from("contacts" as never)
      .select("*" as never)
      .eq("id" as never, data.contactId as never)
      .eq("company_id" as never, data.companyId as never)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Contact not found");

    const [{ data: people }, { data: addresses }, { data: groupRows }, { data: tagRows }] =
      await Promise.all([
        context.supabase
          .from("contact_people" as never)
          .select("*" as never)
          .eq("contact_id" as never, data.contactId as never)
          .order("sort_order" as never),
        context.supabase
          .from("contact_addresses" as never)
          .select("*" as never)
          .eq("contact_id" as never, data.contactId as never),
        context.supabase
          .from("contact_group_members" as never)
          .select("group_id, contact_groups(id, name, color)" as never)
          .eq("contact_id" as never, data.contactId as never),
        context.supabase
          .from("contact_tag_assignments" as never)
          .select("tag_id, contact_tags(id, name)" as never)
          .eq("contact_id" as never, data.contactId as never),
      ]);

    return {
      contact: row,
      people: people ?? [],
      addresses: addresses ?? [],
      groups: groupRows ?? [],
      tags: tagRows ?? [],
    };
  });

export const upsertContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      id?: string;
      name: string;
      kind: string;
      email?: string;
      phone?: string;
      taxNumber?: string;
      paymentTermsDays?: number;
      notes?: string;
      isActive?: boolean;
      accountNumber?: string;
      legalName?: string;
      website?: string;
      defaultCurrency?: string;
      creditLimitMinor?: number | null;
      billingAddressLine1?: string;
      billingCity?: string;
      billingRegion?: string;
      billingPostal?: string;
      billingCountry?: string;
      deliveryAddressLine1?: string;
      deliveryCity?: string;
      deliveryCountry?: string;
      billingAddressLine2?: string;
      deliveryAddressLine2?: string;
      deliveryRegion?: string;
      deliveryPostal?: string;
      defaultSalesAccountId?: string | null;
      defaultPurchaseAccountId?: string | null;
      salesTaxInclusive?: boolean | null;
      purchaseTaxInclusive?: boolean | null;
    }) => {
      const providedFields = Object.keys(input);
      const name = (input.name ?? "").trim();
      if (!name) throw new Error("Contact name is required");
      if (!["supplier", "customer", "both", "employee"].includes(input.kind)) {
        throw new Error("Invalid contact kind");
      }
      const notes = (input.notes ?? "").trim().slice(0, 4000);
      return {
        companyId: assertUuid(input.companyId),
        providedFields,
        id: input.id ? assertUuid(input.id) : undefined,
        name,
        kind: input.kind,
        email: (input.email ?? "").trim().slice(0, 200) || null,
        phone: (input.phone ?? "").trim().slice(0, 60) || null,
        taxNumber: (input.taxNumber ?? "").trim().slice(0, 60) || null,
        paymentTermsDays: Math.max(0, Number(input.paymentTermsDays ?? 30) || 0),
        notes: notes || null,
        isActive: input.isActive !== false,
        accountNumber: (input.accountNumber ?? "").trim().slice(0, 40) || null,
        legalName: (input.legalName ?? "").trim().slice(0, 200) || null,
        website: (input.website ?? "").trim().slice(0, 200) || null,
        defaultCurrency: (input.defaultCurrency ?? "").trim().toUpperCase().slice(0, 3) || null,
        creditLimitMinor:
          input.creditLimitMinor == null
            ? null
            : Math.max(0, Math.floor(Number(input.creditLimitMinor) || 0)),
        billingAddressLine1: (input.billingAddressLine1 ?? "").trim().slice(0, 200) || null,
        billingCity: (input.billingCity ?? "").trim().slice(0, 100) || null,
        billingRegion: (input.billingRegion ?? "").trim().slice(0, 100) || null,
        billingPostal: (input.billingPostal ?? "").trim().slice(0, 40) || null,
        billingCountry: (input.billingCountry ?? "").trim().slice(0, 100) || null,
        deliveryAddressLine1: (input.deliveryAddressLine1 ?? "").trim().slice(0, 200) || null,
        deliveryCity: (input.deliveryCity ?? "").trim().slice(0, 100) || null,
        deliveryCountry: (input.deliveryCountry ?? "").trim().slice(0, 100) || null,
        billingAddressLine2: (input.billingAddressLine2 ?? "").trim().slice(0, 200) || null,
        deliveryAddressLine2: (input.deliveryAddressLine2 ?? "").trim().slice(0, 200) || null,
        deliveryRegion: (input.deliveryRegion ?? "").trim().slice(0, 100) || null,
        deliveryPostal: (input.deliveryPostal ?? "").trim().slice(0, 40) || null,
        defaultSalesAccountId: input.defaultSalesAccountId
          ? assertUuid(input.defaultSalesAccountId)
          : null,
        defaultPurchaseAccountId: input.defaultPurchaseAccountId
          ? assertUuid(input.defaultPurchaseAccountId)
          : null,
        salesTaxInclusive: input.salesTaxInclusive ?? null,
        purchaseTaxInclusive: input.purchaseTaxInclusive ?? null,
      };
    },
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "contacts.manage");

    const { data: dup } = await context.supabase
      .from("contacts" as never)
      .select("id, name" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("is_active" as never, true as never)
      .ilike("name" as never, escapeLikeTerm(data.name) as never);
    const conflict = ((dup ?? []) as Array<{ id: string; name: string }>).find(
      (c) => c.name.toLowerCase() === data.name.toLowerCase() && c.id !== data.id,
    );
    if (conflict) throw new Error(`A contact named "${conflict.name}" already exists`);

    let accountNumber = data.accountNumber;
    if (!data.id && !accountNumber) {
      const { data: settings } = await context.supabase
        .from("company_contact_settings" as never)
        .select("account_number_prefix, next_account_number" as never)
        .eq("company_id" as never, data.companyId as never)
        .maybeSingle();
      const s = settings as { account_number_prefix?: string; next_account_number?: number } | null;
      if (s?.next_account_number) {
        accountNumber = `${s.account_number_prefix ?? "C"}${s.next_account_number}`;
        await context.supabase
          .from("company_contact_settings" as never)
          .update({
            next_account_number: (s.next_account_number ?? 1001) + 1,
            updated_at: new Date().toISOString(),
          } as never)
          .eq("company_id" as never, data.companyId as never);
      }
    }

    const payload = {
      name: data.name,
      kind: data.kind,
      email: data.email,
      phone: data.phone,
      tax_number: data.taxNumber,
      payment_terms_days: data.paymentTermsDays,
      notes: data.notes,
      is_active: data.isActive,
      account_number: accountNumber,
      legal_name: data.legalName,
      website: data.website,
      default_currency: data.defaultCurrency,
      credit_limit_minor: data.creditLimitMinor,
      billing_address_line1: data.billingAddressLine1,
      billing_city: data.billingCity,
      billing_region: data.billingRegion,
      billing_postal: data.billingPostal,
      billing_country: data.billingCountry,
      delivery_address_line1: data.deliveryAddressLine1,
      delivery_city: data.deliveryCity,
      delivery_country: data.deliveryCountry,
      ...(data.billingAddressLine2 !== null
        ? { billing_address_line2: data.billingAddressLine2 }
        : {}),
      ...(data.deliveryAddressLine2 !== null
        ? { delivery_address_line2: data.deliveryAddressLine2 }
        : {}),
      ...(data.deliveryRegion !== null ? { delivery_region: data.deliveryRegion } : {}),
      ...(data.deliveryPostal !== null ? { delivery_postal: data.deliveryPostal } : {}),
      ...(data.defaultSalesAccountId !== null
        ? { default_sales_account_id: data.defaultSalesAccountId }
        : {}),
      ...(data.defaultPurchaseAccountId !== null
        ? { default_purchase_account_id: data.defaultPurchaseAccountId }
        : {}),
      ...(data.salesTaxInclusive !== null ? { sales_tax_inclusive: data.salesTaxInclusive } : {}),
      ...(data.purchaseTaxInclusive !== null
        ? { purchase_tax_inclusive: data.purchaseTaxInclusive }
        : {}),
      updated_at: new Date().toISOString(),
    };

    if (data.id) {
      // This endpoint is used by both the comprehensive creation form and
      // smaller contact editors. Never erase undisplayed financial or address
      // defaults merely because a caller did not submit those fields.
      const patch: Record<string, unknown> = { ...payload };
      const optionalColumns: Record<string, string> = {
        email: "email",
        phone: "phone",
        taxNumber: "tax_number",
        paymentTermsDays: "payment_terms_days",
        notes: "notes",
        isActive: "is_active",
        accountNumber: "account_number",
        legalName: "legal_name",
        website: "website",
        defaultCurrency: "default_currency",
        creditLimitMinor: "credit_limit_minor",
        billingAddressLine1: "billing_address_line1",
        billingAddressLine2: "billing_address_line2",
        billingCity: "billing_city",
        billingRegion: "billing_region",
        billingPostal: "billing_postal",
        billingCountry: "billing_country",
        deliveryAddressLine1: "delivery_address_line1",
        deliveryAddressLine2: "delivery_address_line2",
        deliveryCity: "delivery_city",
        deliveryRegion: "delivery_region",
        deliveryPostal: "delivery_postal",
        deliveryCountry: "delivery_country",
        defaultSalesAccountId: "default_sales_account_id",
        defaultPurchaseAccountId: "default_purchase_account_id",
        salesTaxInclusive: "sales_tax_inclusive",
        purchaseTaxInclusive: "purchase_tax_inclusive",
      };
      for (const [field, column] of Object.entries(optionalColumns)) {
        if (!data.providedFields.includes(field)) delete patch[column];
      }
      // Explicitly submitted null values clear previously configured overrides.
      // Omitting a field remains a no-op for partial editors.
      const nullableOverrides = {
        billingAddressLine2: ["billing_address_line2", data.billingAddressLine2],
        deliveryAddressLine2: ["delivery_address_line2", data.deliveryAddressLine2],
        deliveryRegion: ["delivery_region", data.deliveryRegion],
        deliveryPostal: ["delivery_postal", data.deliveryPostal],
        defaultSalesAccountId: ["default_sales_account_id", data.defaultSalesAccountId],
        defaultPurchaseAccountId: ["default_purchase_account_id", data.defaultPurchaseAccountId],
        salesTaxInclusive: ["sales_tax_inclusive", data.salesTaxInclusive],
        purchaseTaxInclusive: ["purchase_tax_inclusive", data.purchaseTaxInclusive],
      } as const;
      for (const [field, [column, value]] of Object.entries(nullableOverrides)) {
        if (data.providedFields.includes(field)) patch[column] = value;
      }
      const { data: row, error } = await context.supabase
        .from("contacts" as never)
        .update(patch as never)
        .eq("id" as never, data.id as never)
        .eq("company_id" as never, data.companyId as never)
        .select("id")
        .maybeSingle();
      if (error) {
        if (error.code === "23505") throw new Error("Account number or name already exists");
        throw new Error(error.message);
      }
      if (!row) throw new Error("Contact not found");
      return { id: data.id };
    }

    const { data: row, error } = await context.supabase
      .from("contacts" as never)
      .insert({ company_id: data.companyId, ...payload } as never)
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("Account number or name already exists");
      throw new Error(error.message);
    }
    return { id: (row as { id: string }).id };
  });

export const archiveContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; contactId: string; restore?: boolean }) => ({
    companyId: assertUuid(input.companyId),
    contactId: assertUuid(input.contactId),
    restore: Boolean(input.restore),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "contacts.manage");
    if (!data.restore) {
      // Archived contacts drop out of pickers, so their open documents could no longer be settled.
      const { recv, pay } = await loadOpenDocs(context.supabase, data.companyId, data.contactId);
      const open = [...recv, ...pay].filter(
        (d) =>
          Number(d.total_minor) - Number(d.amount_paid_minor) - Number(d.amount_credited_minor) > 0,
      ).length;
      if (open > 0) {
        throw new Error(
          `This contact has ${open} open invoice${open === 1 ? "" : "s"} or bill${open === 1 ? "" : "s"}. Settle or void them before archiving.`,
        );
      }
    }
    const { error } = await context.supabase
      .from("contacts" as never)
      .update({
        archived_at: data.restore ? null : new Date().toISOString(),
        is_active: data.restore,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id" as never, data.contactId as never)
      .eq("company_id" as never, data.companyId as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getContactBalances = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      contactId: string;
      limit?: number;
      invoiceOffset?: number;
      billOffset?: number;
    }) => ({
      companyId: assertUuid(input.companyId),
      contactId: assertUuid(input.contactId),
      limit: Math.min(100, Math.max(1, Math.floor(Number(input.limit ?? 50) || 50))),
      invoiceOffset: Math.min(
        1_000_000,
        Math.max(0, Math.floor(Number(input.invoiceOffset ?? 0) || 0)),
      ),
      billOffset: Math.min(1_000_000, Math.max(0, Math.floor(Number(input.billOffset ?? 0) || 0))),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);

    const {
      data: invoices,
      count: invoiceCount,
      error: iErr,
    } = await context.supabase
      .from("sales_invoices" as never)
      .select(
        "id, invoice_date, due_date, status, total_minor, amount_paid_minor, amount_credited_minor, invoice_number, currency_code" as never,
        { count: "exact" },
      )
      .eq("company_id" as never, data.companyId as never)
      .eq("contact_id" as never, data.contactId as never)
      .neq("status" as never, "void" as never)
      .order("invoice_date" as never, { ascending: false })
      .order("id" as never)
      .range(data.invoiceOffset, data.invoiceOffset + data.limit - 1);
    if (iErr) throw new Error(iErr.message);

    const {
      data: bills,
      count: billCount,
      error: bErr,
    } = await context.supabase
      .from("purchase_bills" as never)
      .select(
        "id, bill_date, due_date, status, total_minor, amount_paid_minor, amount_credited_minor, bill_number, supplier_invoice_number, currency_code" as never,
        { count: "exact" },
      )
      .eq("company_id" as never, data.companyId as never)
      .eq("contact_id" as never, data.contactId as never)
      .neq("status" as never, "void" as never)
      .order("bill_date" as never, { ascending: false })
      .order("id" as never)
      .range(data.billOffset, data.billOffset + data.limit - 1);
    if (bErr) throw new Error(bErr.message);

    const { data: company } = await context.supabase
      .from("companies")
      .select("base_currency")
      .eq("id", data.companyId)
      .maybeSingle();
    const baseCurrency = (company?.base_currency ?? "GBP").toUpperCase();
    const today = new Date().toISOString().slice(0, 10);
    // Totals come from ALL open documents, not the paginated history rows.
    const { recv, pay } = await loadOpenDocs(context.supabase, data.companyId, data.contactId);
    const r = aggregateOutstanding(recv, today, baseCurrency);
    const p = aggregateOutstanding(pay, today, baseCurrency);

    return {
      invoices: invoices ?? [],
      bills: bills ?? [],
      invoiceCount: invoiceCount ?? 0,
      billCount: billCount ?? 0,
      baseCurrency,
      receivableMinor: r.base.outstandingMinor,
      payableMinor: p.base.outstandingMinor,
      overdueReceivableMinor: r.base.overdueMinor,
      overduePayableMinor: p.base.overdueMinor,
      receivableByCurrency: r.byCurrency,
      payableByCurrency: p.byCurrency,
    };
  });

/* ── People ── */
export const upsertContactPerson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      contactId: string;
      id?: string;
      firstName: string;
      lastName?: string;
      email?: string;
      phone?: string;
      jobTitle?: string;
      isPrimary?: boolean;
      roleLabel?: string;
    }) => ({
      companyId: assertUuid(input.companyId),
      contactId: assertUuid(input.contactId),
      id: input.id ? assertUuid(input.id) : undefined,
      firstName: (input.firstName ?? "").trim().slice(0, 100),
      lastName: (input.lastName ?? "").trim().slice(0, 100),
      email: (input.email ?? "").trim().slice(0, 200) || null,
      phone: (input.phone ?? "").trim().slice(0, 60) || null,
      jobTitle: (input.jobTitle ?? "").trim().slice(0, 100) || null,
      isPrimary: Boolean(input.isPrimary),
      roleLabel: (input.roleLabel ?? "").trim().slice(0, 60) || null,
    }),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "contacts.manage");
    if (!data.firstName && !data.email) throw new Error("Person needs a name or email");
    if (data.isPrimary) {
      await context.supabase
        .from("contact_people" as never)
        .update({ is_primary: false } as never)
        .eq("contact_id" as never, data.contactId as never)
        .eq("company_id" as never, data.companyId as never);
    }
    const payload = {
      company_id: data.companyId,
      contact_id: data.contactId,
      first_name: data.firstName,
      last_name: data.lastName,
      email: data.email,
      phone: data.phone,
      job_title: data.jobTitle,
      is_primary: data.isPrimary,
      role_label: data.roleLabel,
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("contact_people" as never)
        .update(payload as never)
        .eq("id" as never, data.id as never)
        .eq("company_id" as never, data.companyId as never);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("contact_people" as never)
      .insert(payload as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as { id: string }).id };
  });

export const deleteContactPerson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; personId: string }) => ({
    companyId: assertUuid(input.companyId),
    personId: assertUuid(input.personId),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "contacts.manage");
    const { error } = await context.supabase
      .from("contact_people" as never)
      .delete()
      .eq("id" as never, data.personId as never)
      .eq("company_id" as never, data.companyId as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ── Groups & tags ── */
export const listContactGroups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: assertUuid(input.companyId) }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    const { data: rows, error } = await context.supabase
      .from("contact_groups" as never)
      .select("id, name, description, color, is_active" as never)
      .eq("company_id" as never, data.companyId as never)
      .order("name" as never);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertContactGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      id?: string;
      name: string;
      description?: string;
      color?: string;
      isActive?: boolean;
    }) => {
      const name = (input.name ?? "").trim();
      if (!name) throw new Error("Group name required");
      return {
        companyId: assertUuid(input.companyId),
        id: input.id ? assertUuid(input.id) : undefined,
        name: name.slice(0, 80),
        description: (input.description ?? "").trim().slice(0, 400) || null,
        color: (input.color ?? "").trim().slice(0, 20) || null,
        isActive: input.isActive !== false,
      };
    },
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "contacts.manage");
    if (data.id) {
      const { error } = await context.supabase
        .from("contact_groups" as never)
        .update({
          name: data.name,
          description: data.description,
          color: data.color,
          is_active: data.isActive,
        } as never)
        .eq("id" as never, data.id as never)
        .eq("company_id" as never, data.companyId as never);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("contact_groups" as never)
      .insert({
        company_id: data.companyId,
        name: data.name,
        description: data.description,
        color: data.color,
        is_active: data.isActive,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as { id: string }).id };
  });

export const setContactGroups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; contactId: string; groupIds: string[] }) => ({
    companyId: assertUuid(input.companyId),
    contactId: assertUuid(input.contactId),
    groupIds: (input.groupIds ?? []).map((g) => assertUuid(g)).slice(0, 50),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "contacts.manage");
    await context.supabase
      .from("contact_group_members" as never)
      .delete()
      .eq("contact_id" as never, data.contactId as never)
      .eq("company_id" as never, data.companyId as never);
    if (data.groupIds.length) {
      const { error } = await context.supabase.from("contact_group_members" as never).insert(
        data.groupIds.map((group_id) => ({
          company_id: data.companyId,
          contact_id: data.contactId,
          group_id,
        })) as never,
      );
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const listContactTags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: assertUuid(input.companyId) }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    const { data: rows, error } = await context.supabase
      .from("contact_tags" as never)
      .select("id, name, is_active" as never)
      .eq("company_id" as never, data.companyId as never)
      .order("name" as never);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertContactTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; id?: string; name: string; isActive?: boolean }) => {
    const name = (input.name ?? "").trim().toLowerCase();
    if (!name) throw new Error("Tag name required");
    return {
      companyId: assertUuid(input.companyId),
      id: input.id ? assertUuid(input.id) : undefined,
      name: name.slice(0, 60),
      isActive: input.isActive !== false,
    };
  })
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "contacts.manage");
    if (data.id) {
      const { error } = await context.supabase
        .from("contact_tags" as never)
        .update({ name: data.name, is_active: data.isActive } as never)
        .eq("id" as never, data.id as never)
        .eq("company_id" as never, data.companyId as never);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("contact_tags" as never)
      .insert({ company_id: data.companyId, name: data.name, is_active: data.isActive } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: (row as { id: string }).id };
  });

export const setContactTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; contactId: string; tagIds: string[] }) => ({
    companyId: assertUuid(input.companyId),
    contactId: assertUuid(input.contactId),
    tagIds: (input.tagIds ?? []).map((t) => assertUuid(t)).slice(0, 50),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "contacts.manage");
    await context.supabase
      .from("contact_tag_assignments" as never)
      .delete()
      .eq("contact_id" as never, data.contactId as never)
      .eq("company_id" as never, data.companyId as never);
    if (data.tagIds.length) {
      const { error } = await context.supabase.from("contact_tag_assignments" as never).insert(
        data.tagIds.map((tag_id) => ({
          company_id: data.companyId,
          contact_id: data.contactId,
          tag_id,
        })) as never,
      );
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

/**
 * Add an existing group or tag to the selected contacts without replacing their
 * current assignments. Permission, company, status and label checks precede
 * the single atomic, idempotent database upsert.
 */
export const bulkAddContactLabel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      contactIds: string[];
      labelKind: "group" | "tag";
      labelId: string;
    }) => {
      if (
        !Array.isArray(input.contactIds) ||
        !input.contactIds.length ||
        input.contactIds.length > 50
      ) {
        throw new Error("Select between 1 and 50 contacts from the current page");
      }
      const contactIds = input.contactIds.map((id) => assertUuid(id));
      if (new Set(contactIds).size !== contactIds.length) {
        throw new Error("Contact selection contains duplicate IDs");
      }
      if (input.labelKind !== "group" && input.labelKind !== "tag") {
        throw new Error("Invalid group or tag selection");
      }
      return {
        companyId: assertUuid(input.companyId),
        contactIds,
        labelKind: input.labelKind,
        labelId: assertUuid(input.labelId),
      };
    },
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "contacts.manage");

    const { data: contacts, error: contactError } = await context.supabase
      .from("contacts" as never)
      .select("id" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("is_active" as never, true as never)
      .is("archived_at" as never, null as never)
      .in("id" as never, data.contactIds as never);
    if (contactError) throw new Error(contactError.message);
    if ((contacts ?? []).length !== data.contactIds.length) {
      throw new Error("Some selected contacts are inactive or outside this organisation");
    }

    const labelTable = data.labelKind === "group" ? "contact_groups" : "contact_tags";
    const relationTable =
      data.labelKind === "group" ? "contact_group_members" : "contact_tag_assignments";
    const labelColumn = data.labelKind === "group" ? "group_id" : "tag_id";

    const { data: label, error: labelError } = await context.supabase
      .from(labelTable as never)
      .select("id" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("id" as never, data.labelId as never)
      .eq("is_active" as never, true as never)
      .maybeSingle();
    if (labelError) throw new Error(labelError.message);
    if (!label) throw new Error("Choose an active group or tag from this organisation");

    const assignments = data.contactIds.map((contact_id) => ({
      company_id: data.companyId,
      contact_id,
      [labelColumn]: data.labelId,
    }));
    // ON CONFLICT DO NOTHING retains all existing memberships and makes retries safe.
    const { error, count } = await context.supabase
      .from(relationTable as never)
      .upsert(assignments as never, {
        onConflict: `${labelColumn},contact_id`,
        ignoreDuplicates: true,
        count: "exact",
      });
    if (error) throw new Error(error.message);
    return { selected: data.contactIds.length, added: count ?? 0 };
  });

/* ── Settings ── */
export const getContactSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: assertUuid(input.companyId) }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    const { data: row } = await context.supabase
      .from("company_contact_settings" as never)
      .select("*" as never)
      .eq("company_id" as never, data.companyId as never)
      .maybeSingle();
    if (row) return row;
    return {
      company_id: data.companyId,
      default_kind: "customer",
      account_number_prefix: "C",
      next_account_number: 1001,
      default_payment_terms_days: 30,
    };
  });

export const saveContactSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      defaultKind?: string;
      accountNumberPrefix?: string;
      nextAccountNumber?: number;
      defaultPaymentTermsDays?: number;
    }) => ({
      companyId: assertUuid(input.companyId),
      defaultKind: ["customer", "supplier", "both"].includes(input.defaultKind ?? "")
        ? input.defaultKind!
        : "customer",
      accountNumberPrefix: (input.accountNumberPrefix ?? "C").trim().slice(0, 10) || "C",
      nextAccountNumber: Math.max(1, Math.floor(Number(input.nextAccountNumber ?? 1001) || 1001)),
      defaultPaymentTermsDays: Math.max(
        0,
        Math.floor(Number(input.defaultPaymentTermsDays ?? 30) || 0),
      ),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "contacts.manage");
    const { error } = await context.supabase.from("company_contact_settings" as never).upsert(
      {
        company_id: data.companyId,
        default_kind: data.defaultKind,
        account_number_prefix: data.accountNumberPrefix,
        next_account_number: data.nextAccountNumber,
        default_payment_terms_days: data.defaultPaymentTermsDays,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "company_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ── CSV export / import ── */
export const exportContactsCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; kind?: string; view?: string; q?: string }) => ({
    companyId: assertUuid(input.companyId),
    kind: (input.kind ?? "all").trim(),
    view: (input.view ?? "all").trim(),
    q: (input.q ?? "").trim().slice(0, 100),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    const columns = [
      "name",
      "kind",
      "email",
      "phone",
      "tax_number",
      "payment_terms_days",
      "account_number",
      "legal_name",
      "website",
      "notes",
      "is_active",
    ];
    const rows: Array<Record<string, string | number | null>> = [];
    // Export the matching directory dataset, not only the first loaded page.
    // Reject oversized exports explicitly instead of returning a misleading partial file.
    for (let from = 0; ; from += 1000) {
      let q = context.supabase
        .from("contacts" as never)
        .select(columns.join(",") as never)
        .eq("company_id" as never, data.companyId as never)
        .order("name" as never)
        .order("id" as never)
        .range(from, from + 999);
      if (data.view === "archived") {
        q = q.not("archived_at" as never, "is" as never, null as never);
      } else if (data.view === "inactive") {
        q = q.eq("is_active" as never, false as never).is("archived_at" as never, null as never);
      } else {
        q = q.eq("is_active" as never, true as never).is("archived_at" as never, null as never);
      }
      if (data.kind === "customers" || data.view === "customers") {
        q = q.in("kind" as never, ["customer", "both"] as never);
      } else if (data.kind === "suppliers" || data.view === "suppliers") {
        q = q.in("kind" as never, ["supplier", "both"] as never);
      } else if (data.view === "both") {
        q = q.eq("kind" as never, "both" as never);
      }
      const search = buildIlikeOr(
        [
          "name",
          "email",
          "phone",
          "account_number",
          "tax_number",
          "legal_name",
          "billing_city",
          "billing_region",
          "billing_country",
        ],
        data.q,
      );
      if (search) q = q.or(search as never);
      const { data: page, error } = await q;
      if (error) throw new Error(error.message);
      rows.push(...((page ?? []) as Array<Record<string, string | number | null>>));
      if (rows.length > 50_000) {
        throw new Error("More than 50,000 contacts match. Narrow the filters before exporting.");
      }
      if ((page ?? []).length < 1000) break;
    }
    const csv = buildContactsCsv(
      rows.map((r) => ({ ...r, is_active: r["is_active"] ? "true" : "false" })),
      columns,
    );
    return { csv, count: rows.length };
  });

export const getContactImportTemplate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({ csv: contactImportTemplateCsv() }));

export const importContactsCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; csvText: string; skipDuplicates?: boolean }) => ({
    companyId: assertUuid(input.companyId),
    csvText: String(input.csvText ?? "").slice(0, 2_000_000),
    skipDuplicates: input.skipDuplicates !== false,
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "contacts.manage");
    const { headers, rows } = parseContactsCsv(data.csvText);
    if (!headers.includes("name")) throw new Error("CSV must include a name column");
    const idx = (h: string) => headers.indexOf(h);

    const { data: existing } = await context.supabase
      .from("contacts" as never)
      .select("id, name, email" as never)
      .eq("company_id" as never, data.companyId as never)
      .limit(5000);
    const byName = new Map(
      ((existing ?? []) as Array<{ id: string; name: string }>).map((c) => [
        c.name.toLowerCase(),
        c.id,
      ]),
    );

    let created = 0;
    let skipped = 0;
    let failed = 0;
    const errors: Array<{ row: number; message: string }> = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!;
      const name = (r[idx("name")] ?? "").trim();
      if (!name) {
        failed++;
        errors.push({ row: i + 2, message: "Missing name" });
        continue;
      }
      if (data.skipDuplicates && byName.has(name.toLowerCase())) {
        skipped++;
        continue;
      }
      const kind = (r[idx("kind")] ?? "customer").trim().toLowerCase() || "customer";
      if (!["customer", "supplier", "both", "employee"].includes(kind)) {
        failed++;
        errors.push({
          row: i + 2,
          message: `Invalid kind "${kind}" - use customer, supplier, both or employee`,
        });
        continue;
      }
      const termsRaw = (r[idx("payment_terms_days")] ?? "").trim();
      const terms = termsRaw === "" ? 30 : Number(termsRaw);
      if (!Number.isInteger(terms) || terms < 0 || terms > 3650) {
        failed++;
        errors.push({ row: i + 2, message: `Invalid payment terms "${termsRaw}"` });
        continue;
      }
      const { error } = await context.supabase.from("contacts" as never).insert({
        company_id: data.companyId,
        name,
        kind,
        email: (r[idx("email")] ?? "").trim().slice(0, 200) || null,
        phone: (r[idx("phone")] ?? "").trim().slice(0, 60) || null,
        tax_number: (r[idx("tax_number")] ?? "").trim().slice(0, 60) || null,
        payment_terms_days: terms,
        account_number: (r[idx("account_number")] ?? "").trim().slice(0, 40) || null,
        notes: (r[idx("notes")] ?? "").trim().slice(0, 4000) || null,
        is_active: true,
      } as never);
      if (error) {
        failed++;
        errors.push({ row: i + 2, message: error.message });
      } else {
        created++;
        byName.set(name.toLowerCase(), "new");
      }
    }

    return { created, skipped, failed, errors: errors.slice(0, 100) };
  });

/* ── Duplicates & merge ── */
export const findPotentialDuplicates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({ companyId: assertUuid(input.companyId) }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    // Set-based finder in SQL: no 2,000-contact cap and no O(n^2) loop in the server.
    const rpc = await context.supabase.rpc(
      "find_duplicate_contacts" as never,
      { _company_id: data.companyId, _limit: 50 } as never,
    );
    if (!rpc.error) {
      type Row = {
        a_id: string;
        a_name: string;
        a_email: string | null;
        a_phone: string | null;
        a_tax_number: string | null;
        a_account_number: string | null;
        b_id: string;
        b_name: string;
        b_email: string | null;
        b_phone: string | null;
        b_tax_number: string | null;
        b_account_number: string | null;
        score: number;
        reasons: string[];
      };
      return ((rpc.data ?? []) as unknown as Row[]).map((r) => ({
        a: {
          id: r.a_id,
          name: r.a_name,
          email: r.a_email,
          phone: r.a_phone,
          tax_number: r.a_tax_number,
          account_number: r.a_account_number,
        },
        b: {
          id: r.b_id,
          name: r.b_name,
          email: r.b_email,
          phone: r.b_phone,
          tax_number: r.b_tax_number,
          account_number: r.b_account_number,
        },
        score: r.score,
        reasons: r.reasons,
      }));
    }
    // Older database without the function: bounded in-app fallback.
    const { data: rows, error } = await context.supabase
      .from("contacts" as never)
      .select("id, name, email, phone, tax_number, account_number, is_active" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("is_active" as never, true as never)
      .limit(2000);
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as Array<{
      id: string;
      name: string;
      email: string | null;
      phone: string | null;
      tax_number: string | null;
      account_number: string | null;
    }>;
    const pairs: Array<{
      a: (typeof list)[0];
      b: (typeof list)[0];
      score: number;
      reasons: string[];
    }> = [];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const { score, reasons } = duplicateScore(list[i]!, list[j]!);
        if (score >= 40) pairs.push({ a: list[i]!, b: list[j]!, score, reasons });
      }
    }
    pairs.sort((x, y) => y.score - x.score);
    return pairs.slice(0, 50);
  });

export const mergeContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { companyId: string; survivorId: string; mergeId: string; confirm: boolean }) => {
      if (!input.confirm) throw new Error("Merge requires explicit confirmation");
      const survivorId = assertUuid(input.survivorId);
      const mergeId = assertUuid(input.mergeId);
      if (survivorId === mergeId) throw new Error("Cannot merge a contact into itself");
      return { companyId: assertUuid(input.companyId), survivorId, mergeId };
    },
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "contacts.manage");

    // Merging touches many foreign-key relationships. A multi-request fallback
    // can leave accounting references split across contacts if interrupted.
    // Require the audited database transaction rather than pretending undo is atomic.
    const { data: merged, error } = await context.supabase.rpc(
      "merge_contacts" as never,
      {
        _company_id: data.companyId,
        _survivor_id: data.survivorId,
        _merge_id: data.mergeId,
      } as never,
    );
    if (error) {
      if (isMissingFunctionError(error)) {
        throw new Error(
          "Contact merging needs the merge_contacts database migration. No contacts were changed.",
        );
      }
      throw new Error(error.message);
    }
    const result = (merged ?? {}) as { rows_moved?: number };
    return {
      survivorId: data.survivorId,
      mergedId: data.mergeId,
      rowsMoved: Number(result.rows_moved ?? 0),
      atomic: true,
    };
  });
