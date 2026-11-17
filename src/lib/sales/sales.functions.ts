import { createServerFn } from "@tanstack/react-start";
import {
  prepareTransactionCsv,
  validateResolvedTransactionTotals,
} from "@/lib/imports/transaction-import-validation";
import {
  classifyTransactionImportRetry,
  isExactTransactionImportRetry,
  isVerifiedTransactionImportJournal,
  isReconciledTransactionImportJournal,
} from "@/lib/imports/transaction-import-retry";
import { loadSalesTaxCodes } from "@/lib/sales/tax-codes";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import { addDaysIso, type SalesLineInput } from "@/lib/sales/line-helpers";
import { postInvoiceAuthorisation } from "@/lib/sales/posting";
import { resolveArAccount } from "@/lib/sales/ar-accounts";
import { callSalesRpc, requireRpc, type SalesClient } from "@/lib/sales/rpc";
import {
  deleteDraftDocument,
  saveSalesDocument,
  type SalesDraftPricing,
} from "@/lib/sales/doc-save";
import type { PriceListLineSnapshot } from "@/lib/products/price-list-provenance";
import {
  type ListQuery,
  assertReason,
  isIsoDate,
  sortLines,
  loadCompanyDefaults,
  loadTaxTreatment,
  normaliseCurrencyAndFx,
  optionalIsoDate,
  prepareSalesLines,
  searchContactIds,
} from "@/lib/sales/sales-common";
import {
  buildSearchOr,
  clampPage,
  clampPageSize,
  escapeLikeLiteral,
  hasNextPage,
  isIsoDateString,
  pickSort,
} from "@/lib/sales/list-filters";
import { fetchAllPages } from "@/lib/sales/fetch-all";
import { minorToDecimalString, toCsv } from "@/lib/sales/csv";
import {
  assertQuoteTransition,
  isQuoteConvertible,
  isQuoteStatus,
  quoteTimestampColumns,
} from "@/lib/sales/quote-status";
import {
  assessCreditLimit,
  type CreditLimitAssessment,
  type CreditLimitInvoice,
} from "@/lib/sales/credit-limit";

export const CREDIT_LIMIT_ACK_REQUIRED = "CREDIT_LIMIT_ACK_REQUIRED";

async function loadCreditLimitAssessment(
  supabase: SalesClient,
  companyId: string,
  candidate: {
    id: string;
    contactId: string;
    currencyCode: string;
    status: string;
    totalMinor: number;
    amountPaidMinor: number;
    amountCreditedMinor: number;
  },
): Promise<CreditLimitAssessment> {
  const { data: company } = await supabase
    .from("companies" as never)
    .select("base_currency" as never)
    .eq("id" as never, companyId as never)
    .maybeSingle();
  const baseCurrency = String(
    (company as { base_currency?: string } | null)?.base_currency ?? "USD",
  ).toUpperCase();

  const { data: contact, error: cErr } = await supabase
    .from("contacts" as never)
    .select("credit_limit_minor, default_currency" as never)
    .eq("id" as never, candidate.contactId as never)
    .eq("company_id" as never, companyId as never)
    .maybeSingle();
  if (cErr) throw new Error(cErr.message);
  const c = contact as {
    credit_limit_minor?: number | null;
    default_currency?: string | null;
  } | null;
  const limitCurrency = String(c?.default_currency || baseCurrency).toUpperCase();

  const { data: openRows, error: oErr } = await supabase
    .from("sales_invoices" as never)
    .select(
      "id, currency_code, status, total_minor, amount_paid_minor, amount_credited_minor" as never,
    )
    .eq("company_id" as never, companyId as never)
    .eq("contact_id" as never, candidate.contactId as never)
    .in("status" as never, ["authorised", "partly_paid"] as never);
  if (oErr) throw new Error(oErr.message);

  const openInvoices: CreditLimitInvoice[] = (
    (openRows ?? []) as Array<{
      id: string;
      currency_code: string;
      status: string;
      total_minor: number;
      amount_paid_minor: number;
      amount_credited_minor: number;
    }>
  ).map((r) => ({
    id: r.id,
    currencyCode: String(r.currency_code || baseCurrency).toUpperCase(),
    status: r.status,
    totalMinor: Number(r.total_minor) || 0,
    amountPaidMinor: Number(r.amount_paid_minor) || 0,
    amountCreditedMinor: Number(r.amount_credited_minor) || 0,
  }));

  return assessCreditLimit({
    creditLimitMinor: c?.credit_limit_minor ?? null,
    limitCurrencyCode: limitCurrency,
    openInvoices,
    candidate: {
      id: candidate.id,
      currencyCode: candidate.currencyCode.toUpperCase(),
      status: candidate.status,
      totalMinor: candidate.totalMinor,
      amountPaidMinor: candidate.amountPaidMinor,
      amountCreditedMinor: candidate.amountCreditedMinor,
    },
  });
}

// Re-exported for the recurring generator and other modules that import it from here.
export { loadTaxTreatment } from "@/lib/sales/sales-common";

// ---- Customers ----

export const listCustomers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; q?: string }) => ({
    companyId: assertUuid(input.companyId),
    q: (input.q ?? "").trim().slice(0, 100),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    let q = context.supabase
      .from("contacts" as never)
      .select("id, name, email, phone, tax_number, payment_terms_days, is_active, kind" as never)
      .eq("company_id" as never, data.companyId as never)
      .in("kind" as never, ["customer", "both"] as never)
      .order("name" as never);
    if (data.q) q = q.ilike("name" as never, `%${escapeLikeLiteral(data.q)}%` as never);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      id?: string;
      name: string;
      email?: string;
      phone?: string;
      taxNumber?: string;
      paymentTermsDays?: number;
    }) => {
      const name = (input.name ?? "").trim();
      if (name.length < 1) throw new Error("Customer name is required");
      return {
        companyId: assertUuid(input.companyId),
        id: input.id ? assertUuid(input.id) : undefined,
        name,
        email: (input.email ?? "").trim().slice(0, 200) || null,
        phone: (input.phone ?? "").trim().slice(0, 60) || null,
        taxNumber: (input.taxNumber ?? "").trim().slice(0, 60) || null,
        paymentTermsDays: Math.max(0, Number(input.paymentTermsDays ?? 30) || 0),
      };
    },
  )
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "contacts.manage");
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("contacts" as never)
        .update({
          name: data.name,
          email: data.email,
          phone: data.phone,
          tax_number: data.taxNumber,
          payment_terms_days: data.paymentTermsDays,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id" as never, data.id as never)
        .eq("company_id" as never, data.companyId as never)
        .select("id")
        .maybeSingle();
      if (error) {
        if (error.code === "23505") throw new Error("A contact with this name already exists");
        throw new Error(error.message);
      }
      if (!row) throw new Error("Customer not found");
      return { id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("contacts" as never)
      .insert({
        company_id: data.companyId,
        kind: "customer",
        name: data.name,
        email: data.email,
        phone: data.phone,
        tax_number: data.taxNumber,
        payment_terms_days: data.paymentTermsDays,
      } as never)
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("A contact with this name already exists");
      throw new Error(error.message);
    }
    return { id: (row as { id: string }).id };
  });

async function customerTerms(
  supabase: SalesClient,
  companyId: string,
  contactId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("contacts" as never)
    .select("payment_terms_days" as never)
    .eq("id" as never, contactId as never)
    .eq("company_id" as never, companyId as never)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Customer not found in this organisation");
  return Math.max(
    0,
    Number((data as { payment_terms_days: number | null }).payment_terms_days ?? 30),
  );
}

// ---- Invoice list (search / filters / sort / pagination / CSV) ----

const INVOICE_STATUSES = ["draft", "authorised", "partly_paid", "paid", "void"] as const;
const INVOICE_SORTS = [
  "invoice_date",
  "due_date",
  "invoice_number",
  "total_minor",
  "status",
] as const;

type InvoiceListInput = {
  companyId: string;
  status?: string;
  /** Pseudo filter: authorised/partly-paid invoices past their due date. */
  overdue?: boolean;
  contactId?: string;
  q?: string;
  from?: string;
  to?: string;
  sort?: string;
  dir?: string;
  page?: number;
  pageSize?: number;
};

function parseInvoiceListInput(input: InvoiceListInput) {
  const status = (input.status ?? "").trim();
  return {
    companyId: assertUuid(input.companyId),
    status: (INVOICE_STATUSES as readonly string[]).includes(status) ? status : null,
    overdue: Boolean(input.overdue),
    contactId: input.contactId ? assertUuid(input.contactId, "customer") : null,
    q: (input.q ?? "").trim().slice(0, 100),
    from: isIsoDateString(input.from) ? input.from : null,
    to: isIsoDateString(input.to) ? input.to : null,
    sort: pickSort(input.sort, INVOICE_SORTS, "invoice_date"),
    ascending: input.dir === "asc",
    page: clampPage(input.page),
    pageSize: clampPageSize(input.pageSize),
  };
}

const INVOICE_LIST_COLUMNS =
  "id, invoice_number, invoice_date, due_date, status, total_minor, amount_paid_minor, amount_credited_minor, currency_code, contact_id, sent_at, contacts(name)";

async function invoiceListQueryParts(
  supabase: SalesClient,
  f: ReturnType<typeof parseInvoiceListInput>,
) {
  const defaults = await loadCompanyDefaults(supabase, f.companyId);
  const ids = f.q ? await searchContactIds(supabase, f.companyId, f.q) : [];
  const or = buildSearchOr(f.q, ["invoice_number", "memo"], ids);
  return { today: defaults.today, or };
}

function applyInvoiceFilters(
  q: ListQuery,
  f: ReturnType<typeof parseInvoiceListInput>,
  parts: { today: string; or: string | null },
): ListQuery {
  let out = q.eq("company_id" as never, f.companyId as never);
  if (f.status) out = out.eq("status" as never, f.status as never);
  if (f.overdue) {
    out = out
      .in("status" as never, ["authorised", "partly_paid"] as never)
      .lt("due_date" as never, parts.today as never);
  }
  if (f.contactId) out = out.eq("contact_id" as never, f.contactId as never);
  if (f.from) out = out.gte("invoice_date" as never, f.from as never);
  if (f.to) out = out.lte("invoice_date" as never, f.to as never);
  if (parts.or) out = out.or(parts.or as never);
  return out;
}

export type InvoiceListRow = {
  id: string;
  invoice_number: string | null;
  invoice_date: string;
  due_date: string;
  status: string;
  total_minor: number;
  amount_paid_minor: number;
  amount_credited_minor: number;
  currency_code: string;
  contact_id: string;
  sent_at: string | null;
  contacts: { name: string } | null;
};

export const listInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parseInvoiceListInput)
  .handler(async ({ data: f, context }) => {
    await assertCompanyMember(context.supabase, f.companyId);
    const parts = await invoiceListQueryParts(context.supabase, f);
    const base = context.supabase
      .from("sales_invoices" as never)
      .select(INVOICE_LIST_COLUMNS as never, { count: "exact" });
    const {
      data: rows,
      error,
      count,
    } = await applyInvoiceFilters(base as never, f, parts)
      .order(f.sort as never, { ascending: f.ascending } as never)
      .order("id" as never, { ascending: true } as never)
      .range(f.page * f.pageSize, f.page * f.pageSize + f.pageSize - 1);
    if (error) throw new Error((error as { message: string }).message);
    const total = count ?? 0;
    return {
      rows: (rows ?? []) as unknown as InvoiceListRow[],
      total,
      page: f.page,
      pageSize: f.pageSize,
      hasNext: hasNextPage(total, f.page, f.pageSize),
      today: parts.today,
    };
  });

export const exportInvoicesCsv = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parseInvoiceListInput)
  .handler(async ({ data: f, context }) => {
    await assertCompanyMember(context.supabase, f.companyId);
    const parts = await invoiceListQueryParts(context.supabase, f);
    const rows = await fetchAllPages<Record<string, unknown>>(
      (from, to) =>
        applyInvoiceFilters(
          context.supabase
            .from("sales_invoices" as never)
            .select(INVOICE_LIST_COLUMNS as never) as unknown as ListQuery,
          f,
          parts,
        )
          .order(f.sort as never, { ascending: f.ascending } as never)
          .order("id" as never, { ascending: true } as never)
          .range(from, to) as never,
    );
    const csv = toCsv(
      [
        "Number",
        "Date",
        "Due",
        "Customer",
        "Status",
        "Currency",
        "Total",
        "Paid",
        "Credited",
        "Outstanding",
      ],
      rows.map((r) => {
        const total = Number(r["total_minor"]);
        const paid = Number(r["amount_paid_minor"]);
        const cred = Number(r["amount_credited_minor"]);
        const draftOrVoid = r["status"] === "draft" || r["status"] === "void";
        return [
          r["invoice_number"],
          r["invoice_date"],
          r["due_date"],
          (r["contacts"] as { name?: string } | null)?.name ?? "",
          r["status"],
          r["currency_code"],
          minorToDecimalString(total),
          minorToDecimalString(paid),
          minorToDecimalString(cred),
          minorToDecimalString(draftOrVoid ? 0 : total - paid - cred),
        ];
      }),
    );
    return { filename: `invoices-${parts.today}.csv`, csv, rowCount: rows.length };
  });

// ---- Invoice detail ----

export type InvoiceDetail = {
  id: string;
  price_list_id: string | null;
  price_list_name_snapshot: string | null;
  status: string;
  invoice_number: string | null;
  invoice_date: string;
  due_date: string;
  memo: string | null;
  currency_code: string;
  contact_id: string;
  subtotal_minor: number;
  tax_minor: number;
  total_minor: number;
  amount_paid_minor: number;
  amount_credited_minor: number;
  posted_journal_id: string | null;
  void_journal_id: string | null;
  quote_id: string | null;
  sent_at: string | null;
  void_reason: string | null;
  contacts: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    tax_number: string | null;
  } | null;
  sales_invoice_lines: Array<{
    id: string;
    line_order: number;
    description: string;
    account_id: string;
    quantity: number;
    unit_price_minor: number;
    pricing_snapshot?: PriceListLineSnapshot | null;
    discount_minor: number;
    tax_rate_bps: number;
    tax_code_id: string | null;
    product_id: string | null;
    net_minor: number;
    tax_minor: number;
    gross_minor: number;
  }>;
  payments: Array<{
    id: string;
    amount_minor: number;
    allocated_on: string | null;
    receipt_id: string;
    sales_receipts: {
      id: string;
      receipt_date: string;
      reference: string | null;
      status: string;
    } | null;
  }>;
  reversed_payments: Array<{
    id: string;
    amount_minor: number;
    reversed_on: string | null;
    reverse_reason: string | null;
    receipt_id: string;
    sales_receipts: { id: string; receipt_date: string; reference: string | null } | null;
  }>;
  credit_applications: Array<{
    id: string;
    amount_minor: number;
    allocated_on: string | null;
    credit_note_id: string;
    sales_credit_notes: { id: string; credit_number: string | null; credit_date: string } | null;
  }>;
  reversed_credit_applications: Array<{
    id: string;
    amount_minor: number;
    reversed_on: string | null;
    reverse_reason: string | null;
    credit_note_id: string;
    sales_credit_notes: { id: string; credit_number: string | null; credit_date: string } | null;
  }>;
  company: {
    name: string;
    legal_name: string | null;
    country_code: string | null;
    invoice_footer: string | null;
    base_currency: string;
  } | null;
  branding: {
    trading_name: string | null;
    letterhead_line: string | null;
    invoice_email: string | null;
    invoice_phone: string | null;
    logo_url: string | null;
  } | null;
  creditLimitAssessment: CreditLimitAssessment | null;
};

export const getInvoice = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; invoiceId: string }) => ({
    companyId: assertUuid(input.companyId),
    invoiceId: assertUuid(input.invoiceId, "invoice"),
  }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertCompanyMember(supabase, data.companyId);
    const { data: row, error } = await supabase
      .from("sales_invoices" as never)
      .select("*, contacts(id, name, email, phone, tax_number), sales_invoice_lines(*)" as never)
      .eq("id" as never, data.invoiceId as never)
      .eq("company_id" as never, data.companyId as never)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Invoice not found");

    // Payment + credit history. Active rows only; reversed rows are listed separately so an
    // accountant can see what was undone and why.
    const richPay =
      "id, amount_minor, allocated_on, reversed_on, reverse_reason, receipt_id, sales_receipts(id, receipt_date, reference, status)";
    const basicPay =
      "id, amount_minor, receipt_id, sales_receipts(id, receipt_date, reference, status)";
    let payRes = await supabase
      .from("sales_receipt_allocations" as never)
      .select(richPay as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("invoice_id" as never, data.invoiceId as never);
    if (payRes.error?.code === "42703") {
      payRes = await supabase
        .from("sales_receipt_allocations" as never)
        .select(basicPay as never)
        .eq("company_id" as never, data.companyId as never)
        .eq("invoice_id" as never, data.invoiceId as never);
    }
    if (payRes.error) throw new Error(payRes.error.message);

    const richCr =
      "id, amount_minor, allocated_on, reversed_on, reverse_reason, credit_note_id, sales_credit_notes(id, credit_number, credit_date, status)";
    const basicCr =
      "id, amount_minor, credit_note_id, sales_credit_notes(id, credit_number, credit_date, status)";
    let crRes = await supabase
      .from("sales_credit_allocations" as never)
      .select(richCr as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("invoice_id" as never, data.invoiceId as never);
    if (crRes.error?.code === "42703") {
      crRes = await supabase
        .from("sales_credit_allocations" as never)
        .select(basicCr as never)
        .eq("company_id" as never, data.companyId as never)
        .eq("invoice_id" as never, data.invoiceId as never);
    }
    if (crRes.error) throw new Error(crRes.error.message);

    const { data: company } = await supabase
      .from("companies" as never)
      .select("name, legal_name, country_code, invoice_footer, base_currency" as never)
      .eq("id" as never, data.companyId as never)
      .maybeSingle();
    const { data: branding } = await supabase
      .from("company_branding" as never)
      .select("trading_name, letterhead_line, invoice_email, invoice_phone, logo_url" as never)
      .eq("company_id" as never, data.companyId as never)
      .maybeSingle();

    const split = <T extends { reversed_on?: string | null }>(rows: T[]) => ({
      active: rows.filter((r) => !r.reversed_on),
      reversed: rows.filter((r) => Boolean(r.reversed_on)),
    });
    const pay = split((payRes.data ?? []) as unknown as Array<{ reversed_on?: string | null }>);
    const cr = split((crRes.data ?? []) as unknown as Array<{ reversed_on?: string | null }>);
    const invoiceRow = row as unknown as {
      id: string;
      contact_id: string;
      currency_code: string;
      status: string;
      total_minor: number;
      amount_paid_minor: number;
      amount_credited_minor: number;
      sales_invoice_lines: Array<{ line_order: number; id: string }>;
    };
    let creditLimitAssessment: CreditLimitAssessment | null = null;
    try {
      creditLimitAssessment = await loadCreditLimitAssessment(
        supabase as SalesClient,
        data.companyId,
        {
          id: invoiceRow.id,
          contactId: invoiceRow.contact_id,
          currencyCode: invoiceRow.currency_code,
          status: invoiceRow.status,
          totalMinor: Number(invoiceRow.total_minor) || 0,
          amountPaidMinor: Number(invoiceRow.amount_paid_minor) || 0,
          amountCreditedMinor: Number(invoiceRow.amount_credited_minor) || 0,
        },
      );
    } catch {
      creditLimitAssessment = null;
    }
    return {
      ...(row as unknown as Record<string, unknown>),
      sales_invoice_lines: sortLines(invoiceRow.sales_invoice_lines ?? []),
      payments: pay.active,
      reversed_payments: pay.reversed,
      credit_applications: cr.active,
      reversed_credit_applications: cr.reversed,
      company: company ?? null,
      branding: branding ?? null,
      creditLimitAssessment,
    } as unknown as InvoiceDetail;
  });

// ---- Invoice save / authorise ----

type InvoiceDraftInput = {
  companyId: string;
  invoiceId?: string;
  contactId: string;
  invoiceDate: string;
  dueDate: string;
  invoiceNumber?: string;
  memo?: string;
  currencyCode: string;
  fxRateToBase?: number;
  lines: SalesLineInput[];
  pricing?: SalesDraftPricing | undefined;
};

function validatePricingPayload(
  pricing: SalesDraftPricing | undefined,
  lineCount: number,
): SalesDraftPricing | undefined {
  if (!pricing) return undefined;
  if (!Array.isArray(pricing.lines) || pricing.lines.length !== lineCount) {
    throw new Error("Pricing snapshot count must match document lines");
  }
  return {
    priceListId: pricing.priceListId ? assertUuid(pricing.priceListId, "price list") : null,
    lines: pricing.lines.map((trace) => {
      if (trace === null) return null;
      if (!trace || typeof trace !== "object" || trace.source !== "price_list") {
        throw new Error("Invalid line pricing provenance");
      }
      if (!Number.isSafeInteger(trace.unit_price_minor) || trace.unit_price_minor < 0) {
        throw new Error("Invalid price-list unit amount");
      }
      if (
        !Number.isInteger(trace.discount_bps) ||
        trace.discount_bps < 0 ||
        trace.discount_bps > 10000
      ) {
        throw new Error("Invalid pricing discount basis points");
      }
      return {
        ...trace,
        price_list_id: assertUuid(trace.price_list_id, "line price list"),
        product_id: assertUuid(trace.product_id, "line product"),
      };
    }),
  };
}

function parseInvoiceDraftInput(input: InvoiceDraftInput) {
  if (!isIsoDate(input.invoiceDate) || !isIsoDate(input.dueDate)) {
    throw new Error("Invoice and due dates must be YYYY-MM-DD");
  }
  if (input.dueDate < input.invoiceDate) throw new Error("Due date cannot be before invoice date");
  return {
    companyId: assertUuid(input.companyId),
    invoiceId: input.invoiceId ? assertUuid(input.invoiceId, "invoice") : undefined,
    contactId: assertUuid(input.contactId, "customer"),
    invoiceDate: input.invoiceDate,
    dueDate: input.dueDate,
    invoiceNumber: (input.invoiceNumber ?? "").trim().slice(0, 40) || null,
    memo: (input.memo ?? "").trim().slice(0, 500) || null,
    currencyCode: input.currencyCode ?? "",
    fxRateToBase: input.fxRateToBase,
    lines: input.lines,
    pricing: validatePricingPayload(input.pricing, input.lines.length),
  };
}

type ServerCtx = { supabase: SalesClient; userId: string };

async function saveInvoiceDraftCore(
  { supabase, userId }: ServerCtx,
  data: ReturnType<typeof parseInvoiceDraftInput>,
) {
  await assertCompanyPermission(supabase, data.companyId, "sales.draft");
  const defaults = await loadCompanyDefaults(supabase, data.companyId);
  const { currencyCode, fxRateToBase } = normaliseCurrencyAndFx(
    data.currencyCode,
    defaults.baseCurrency,
    data.fxRateToBase,
  );
  const lines = await prepareSalesLines(supabase, data.companyId, data.lines, data.invoiceDate);
  const saved = await saveSalesDocument(supabase, {
    kind: "invoice",
    companyId: data.companyId,
    userId,
    id: data.invoiceId,
    contactId: data.contactId,
    docDate: data.invoiceDate,
    dueDate: data.dueDate,
    number: data.invoiceNumber,
    memo: data.memo,
    currencyCode,
    fxRateToBase,
    lines,
    pricing: data.pricing,
  });
  return { id: saved.id, invoiceNumber: saved.number };
}

export const saveInvoiceDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parseInvoiceDraftInput)
  .handler(async ({ data, context }) => saveInvoiceDraftCore(context, data));

async function authoriseInvoiceCore(
  { supabase, userId }: ServerCtx,
  companyId: string,
  invoiceId: string,
  acknowledgeCreditLimit = false,
) {
  await assertCompanyPermission(supabase, companyId, "sales.authorise");
  const { data: inv, error } = await supabase
    .from("sales_invoices" as never)
    .select("*, sales_invoice_lines(*)" as never)
    .eq("id" as never, invoiceId as never)
    .eq("company_id" as never, companyId as never)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!inv) throw new Error("Invoice not found");
  const b = inv as unknown as {
    id: string;
    contact_id: string;
    status: string;
    invoice_date: string;
    invoice_number: string | null;
    currency_code: string;
    fx_rate_to_base?: number | null;
    memo: string | null;
    total_minor: number;
    subtotal_minor: number;
    tax_minor: number;
    amount_paid_minor?: number;
    amount_credited_minor?: number;
    posted_journal_id: string | null;
    sales_invoice_lines: Array<{
      account_id: string;
      description: string;
      net_minor: number;
      tax_minor: number;
    }>;
  };
  if (b.status !== "draft") throw new Error("Only draft invoices can be authorised");
  if (b.posted_journal_id) throw new Error("Invoice already posted");
  if (!b.sales_invoice_lines.length) throw new Error("Invoice has no lines");
  const lineNet = b.sales_invoice_lines.reduce((s, l) => s + Number(l.net_minor), 0);
  const lineTax = b.sales_invoice_lines.reduce((s, l) => s + Number(l.tax_minor), 0);
  if (lineNet !== Number(b.subtotal_minor) || lineTax !== Number(b.tax_minor)) {
    throw new Error("Invoice totals do not match its lines — re-save the draft before authorising");
  }
  if (!(Number(b.total_minor) > 0)) throw new Error("Invoice total must be greater than zero");

  const credit = await loadCreditLimitAssessment(supabase as SalesClient, companyId, {
    id: b.id,
    contactId: b.contact_id,
    currencyCode: b.currency_code,
    status: b.status,
    totalMinor: Number(b.total_minor) || 0,
    amountPaidMinor: Number(b.amount_paid_minor) || 0,
    amountCreditedMinor: Number(b.amount_credited_minor) || 0,
  });
  if (credit.overLimit && !acknowledgeCreditLimit) {
    throw new Error(`${CREDIT_LIMIT_ACK_REQUIRED}: ${credit.message}`);
  }

  let number = b.invoice_number;
  if (!number) {
    const { allocateDocumentNumber } = await import("@/lib/settings/document-numbering");
    number = await allocateDocumentNumber(supabase as never, companyId, "sales_invoice");
  }

  // Idempotent on invoice id: a retry after a partial failure returns the same journal.
  const journalId = await postInvoiceAuthorisation(supabase as never, {
    company_id: companyId,
    invoice_id: invoiceId,
    invoice_date: b.invoice_date,
    currency_code: b.currency_code,
    fx_rate_to_base: Number(b.fx_rate_to_base ?? 1),
    ...(b.memo ? { memo: b.memo } : {}),
    lines: b.sales_invoice_lines.map((l) => ({
      account_id: l.account_id,
      description: l.description,
      net_minor: l.net_minor,
      tax_minor: l.tax_minor,
    })),
  });

  const nowIso = new Date().toISOString();
  const { data: claimed, error: upErr } = await supabase
    .from("sales_invoices" as never)
    .update({
      status: "authorised",
      invoice_number: number,
      posted_journal_id: journalId,
      authorised_at: nowIso,
      authorised_by: userId,
      updated_at: nowIso,
    } as never)
    .eq("id" as never, invoiceId as never)
    .eq("company_id" as never, companyId as never)
    .eq("status" as never, "draft" as never)
    .select("id");
  if (upErr) {
    throw new Error(
      `The journal was posted but the invoice could not be marked authorised (${upErr.message}). Retry authorise — it is safe to repeat.`,
    );
  }
  if (!claimed || (claimed as unknown[]).length === 0) {
    // Someone else authorised it between our read and write; the idempotent journal is the same one.
    return { journalId, invoiceNumber: number, alreadyAuthorised: true };
  }
  return { journalId, invoiceNumber: number, alreadyAuthorised: false };
}

export const authoriseInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { companyId: string; invoiceId: string; acknowledgeCreditLimit?: boolean }) => ({
      companyId: assertUuid(input.companyId),
      invoiceId: assertUuid(input.invoiceId, "invoice"),
      acknowledgeCreditLimit: Boolean(input.acknowledgeCreditLimit),
    }),
  )
  .handler(async ({ data, context }) =>
    authoriseInvoiceCore(context, data.companyId, data.invoiceId, data.acknowledgeCreditLimit),
  );

/**
 * "Save and authorise" in ONE call (AR-11). The draft is saved first; if authorising then fails the
 * draft id is returned with the error so the browser opens that draft instead of creating a second
 * one on the next click.
 */
export const saveAndAuthoriseInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parseInvoiceDraftInput)
  .handler(async ({ data, context }) => {
    const saved = await saveInvoiceDraftCore(context, data);
    try {
      const res = await authoriseInvoiceCore(context, data.companyId, saved.id);
      return { id: saved.id, journalId: res.journalId, authoriseError: null as string | null };
    } catch (e) {
      return {
        id: saved.id,
        journalId: null as string | null,
        authoriseError: e instanceof Error ? e.message : "Could not authorise the invoice",
      };
    }
  });

// ---- Invoice corrections / conveniences ----

export const voidInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { companyId: string; invoiceId: string; reason: string; voidDate?: string }) => ({
      companyId: assertUuid(input.companyId),
      invoiceId: assertUuid(input.invoiceId, "invoice"),
      reason: assertReason(input.reason, "A void reason"),
      voidDate: optionalIsoDate(input.voidDate, "Void date"),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertCompanyPermission(supabase, data.companyId, "sales.void");
    const rpc = await callSalesRpc<{ invoice_id: string; void_journal_id: string }>(
      supabase,
      "void_sales_invoice",
      {
        company_id: data.companyId,
        invoice_id: data.invoiceId,
        reason: data.reason,
        void_date: data.voidDate,
      },
    );
    const done = requireRpc(
      rpc,
      "void_sales_invoice",
      "20261024110300_sales_ar_correction_rpcs.sql",
    );
    return { journalId: done.void_journal_id };
  });

export const writeOffInvoiceBadDebt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      invoiceId: string;
      reason: string;
      writeOffDate?: string;
      badDebtAccountId?: string;
    }) => ({
      companyId: assertUuid(input.companyId),
      invoiceId: assertUuid(input.invoiceId, "invoice"),
      reason: assertReason(input.reason, "A write-off reason"),
      writeOffDate: optionalIsoDate(input.writeOffDate, "Write-off date"),
      badDebtAccountId: input.badDebtAccountId
        ? assertUuid(input.badDebtAccountId, "bad debt account")
        : null,
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertCompanyPermission(supabase, data.companyId, "sales.void");
    const rpc = await callSalesRpc<{
      credit_note_id: string;
      journal_id: string;
      written_off_minor: number;
    }>(supabase, "write_off_bad_debt", {
      company_id: data.companyId,
      invoice_id: data.invoiceId,
      reason: data.reason,
      write_off_date: data.writeOffDate,
      bad_debt_account_id: data.badDebtAccountId,
    });
    const done = requireRpc(
      rpc,
      "write_off_bad_debt",
      "20261025300100_ops_money_documents_rpcs.sql",
    );
    return {
      creditNoteId: done.credit_note_id,
      journalId: done.journal_id,
      writtenOffMinor: Number(done.written_off_minor),
    };
  });

export const deleteDraftInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; invoiceId: string }) => ({
    companyId: assertUuid(input.companyId),
    invoiceId: assertUuid(input.invoiceId, "invoice"),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "sales.draft");
    await deleteDraftDocument(context.supabase, data.companyId, "invoice", data.invoiceId);
    return { ok: true };
  });

export const markInvoiceSent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; invoiceId: string }) => ({
    companyId: assertUuid(input.companyId),
    invoiceId: assertUuid(input.invoiceId, "invoice"),
  }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertCompanyPermission(supabase, data.companyId, "sales.draft");
    const nowIso = new Date().toISOString();
    const { data: row, error } = await supabase
      .from("sales_invoices" as never)
      .update({ sent_at: nowIso } as never)
      .eq("id" as never, data.invoiceId as never)
      .eq("company_id" as never, data.companyId as never)
      .in("status" as never, ["authorised", "partly_paid", "paid"] as never)
      .select("id");
    if (error) {
      if (error.code === "42703") {
        throw new Error("Marking as sent needs a database update that has not been applied yet");
      }
      throw new Error(error.message);
    }
    if (!row || (row as unknown[]).length === 0) {
      throw new Error("Only authorised invoices can be marked as sent");
    }
    return { sentAt: nowIso };
  });

/** Copy an invoice into a NEW draft dated today (company timezone) with the customer's terms. */
export const copyInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; invoiceId: string }) => ({
    companyId: assertUuid(input.companyId),
    invoiceId: assertUuid(input.invoiceId, "invoice"),
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCompanyPermission(supabase, data.companyId, "sales.draft");
    const { data: inv, error } = await supabase
      .from("sales_invoices" as never)
      .select("contact_id, memo, currency_code, fx_rate_to_base, sales_invoice_lines(*)" as never)
      .eq("id" as never, data.invoiceId as never)
      .eq("company_id" as never, data.companyId as never)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!inv) throw new Error("Invoice not found");
    const src = inv as unknown as {
      contact_id: string;
      memo: string | null;
      currency_code: string;
      fx_rate_to_base?: number | null;
      sales_invoice_lines: Array<{
        line_order: number;
        description: string;
        account_id: string;
        quantity: number;
        unit_price_minor: number;
        discount_minor: number;
        tax_rate_bps: number;
        tax_code_id: string | null;
        product_id: string | null;
      }>;
    };
    const defaults = await loadCompanyDefaults(supabase, data.companyId);
    const terms = await customerTerms(supabase, data.companyId, src.contact_id);
    const today = defaults.today;
    const { currencyCode, fxRateToBase } = normaliseCurrencyAndFx(
      src.currency_code,
      defaults.baseCurrency,
      src.fx_rate_to_base ?? 1,
    );
    const { loadSalesTaxCodes } = await import("@/lib/sales/tax-codes");
    const available = new Set(
      (await loadSalesTaxCodes(supabase, data.companyId, today)).map((c) => c.id),
    );
    const lines = await prepareSalesLines(
      supabase,
      data.companyId,
      sortLines(src.sales_invoice_lines).map((l) => ({
        description: l.description,
        accountId: l.account_id,
        quantity: Number(l.quantity),
        unitPriceMinor: Number(l.unit_price_minor),
        discountMinor: Number(l.discount_minor),
        taxRateBps: Number(l.tax_rate_bps),
        taxCodeId: l.tax_code_id && available.has(l.tax_code_id) ? l.tax_code_id : null,
        productId: l.product_id ?? null,
      })),
      today,
    );
    const saved = await saveSalesDocument(supabase, {
      kind: "invoice",
      companyId: data.companyId,
      userId,
      contactId: src.contact_id,
      docDate: today,
      dueDate: addDaysIso(today, terms),
      memo: src.memo,
      currencyCode,
      fxRateToBase,
      lines,
    });
    return { id: saved.id };
  });

// ---- Quotes ----

const QUOTE_SORTS = ["quote_date", "expiry_date", "quote_number", "total_minor", "status"] as const;

type QuoteListInput = {
  companyId: string;
  status?: string;
  q?: string;
  from?: string;
  to?: string;
  sort?: string;
  dir?: string;
  page?: number;
  pageSize?: number;
};

function parseQuoteListInput(input: QuoteListInput) {
  const status = (input.status ?? "").trim();
  return {
    companyId: assertUuid(input.companyId),
    status: isQuoteStatus(status) ? status : null,
    q: (input.q ?? "").trim().slice(0, 100),
    from: isIsoDateString(input.from) ? input.from : null,
    to: isIsoDateString(input.to) ? input.to : null,
    sort: pickSort(input.sort, QUOTE_SORTS, "quote_date"),
    ascending: input.dir === "asc",
    page: clampPage(input.page),
    pageSize: clampPageSize(input.pageSize),
  };
}

const QUOTE_LIST_COLUMNS =
  "id, quote_number, quote_date, expiry_date, status, total_minor, currency_code, contact_id, contacts(name), converted_invoice_id";

function applyQuoteFilters(
  q: ListQuery,
  f: ReturnType<typeof parseQuoteListInput>,
  or: string | null,
): ListQuery {
  let out = q.eq("company_id" as never, f.companyId as never);
  if (f.status) out = out.eq("status" as never, f.status as never);
  if (f.from) out = out.gte("quote_date" as never, f.from as never);
  if (f.to) out = out.lte("quote_date" as never, f.to as never);
  if (or) out = out.or(or as never);
  return out;
}

async function quoteSearchOr(
  supabase: SalesClient,
  f: ReturnType<typeof parseQuoteListInput>,
): Promise<string | null> {
  const ids = f.q ? await searchContactIds(supabase, f.companyId, f.q) : [];
  return buildSearchOr(f.q, ["quote_number", "memo"], ids);
}

export const listQuotes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parseQuoteListInput)
  .handler(async ({ data: f, context }) => {
    await assertCompanyMember(context.supabase, f.companyId);
    const or = await quoteSearchOr(context.supabase, f);
    const base = context.supabase
      .from("sales_quotes" as never)
      .select(QUOTE_LIST_COLUMNS as never, { count: "exact" });
    const {
      data: rows,
      error,
      count,
    } = await applyQuoteFilters(base as unknown as ListQuery, f, or)
      .order(f.sort as never, { ascending: f.ascending } as never)
      .order("id" as never, { ascending: true } as never)
      .range(f.page * f.pageSize, f.page * f.pageSize + f.pageSize - 1);
    if (error) throw new Error((error as { message: string }).message);
    const total = count ?? 0;
    const defaults = await loadCompanyDefaults(context.supabase, f.companyId);
    return {
      rows: (rows ?? []) as unknown as Array<{
        id: string;
        quote_number: string | null;
        quote_date: string;
        expiry_date: string | null;
        status: string;
        total_minor: number;
        currency_code: string;
        contact_id: string;
        contacts: { name: string } | null;
        converted_invoice_id: string | null;
      }>,
      total,
      page: f.page,
      pageSize: f.pageSize,
      hasNext: hasNextPage(total, f.page, f.pageSize),
      today: defaults.today,
    };
  });

export const exportQuotesCsv = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parseQuoteListInput)
  .handler(async ({ data: f, context }) => {
    await assertCompanyMember(context.supabase, f.companyId);
    const or = await quoteSearchOr(context.supabase, f);
    const defaults = await loadCompanyDefaults(context.supabase, f.companyId);
    const rows = await fetchAllPages<Record<string, unknown>>(
      (from, to) =>
        applyQuoteFilters(
          context.supabase
            .from("sales_quotes" as never)
            .select(QUOTE_LIST_COLUMNS as never) as unknown as ListQuery,
          f,
          or,
        )
          .order(f.sort as never, { ascending: f.ascending } as never)
          .order("id" as never, { ascending: true } as never)
          .range(from, to) as never,
    );
    const csv = toCsv(
      ["Number", "Date", "Expiry", "Customer", "Status", "Currency", "Total"],
      rows.map((r) => [
        r["quote_number"],
        r["quote_date"],
        r["expiry_date"],
        (r["contacts"] as { name?: string } | null)?.name ?? "",
        r["status"],
        r["currency_code"],
        minorToDecimalString(Number(r["total_minor"])),
      ]),
    );
    return { filename: `quotes-${defaults.today}.csv`, csv, rowCount: rows.length };
  });

export const saveQuoteDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      quoteId?: string;
      contactId: string;
      quoteDate: string;
      expiryDate?: string;
      quoteNumber?: string;
      memo?: string;
      currencyCode: string;
      fxRateToBase?: number;
      lines: SalesLineInput[];
      pricing?: SalesDraftPricing | undefined;
    }) => {
      if (!isIsoDate(input.quoteDate)) throw new Error("Quote date must be YYYY-MM-DD");
      const expiry = (input.expiryDate ?? "").trim();
      if (expiry && !isIsoDate(expiry)) throw new Error("Expiry date must be YYYY-MM-DD");
      if (expiry && expiry < input.quoteDate)
        throw new Error("Expiry date cannot be before the quote date");
      return {
        companyId: assertUuid(input.companyId),
        quoteId: input.quoteId ? assertUuid(input.quoteId) : undefined,
        contactId: assertUuid(input.contactId, "customer"),
        quoteDate: input.quoteDate,
        expiryDate: expiry || null,
        quoteNumber: (input.quoteNumber ?? "").trim().slice(0, 40) || null,
        memo: (input.memo ?? "").trim().slice(0, 500) || null,
        currencyCode: input.currencyCode ?? "",
        fxRateToBase: input.fxRateToBase,
        lines: input.lines,
        pricing: validatePricingPayload(input.pricing, input.lines.length),
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCompanyPermission(supabase, data.companyId, "sales.draft");
    const defaults = await loadCompanyDefaults(supabase, data.companyId);
    const { currencyCode, fxRateToBase } = normaliseCurrencyAndFx(
      data.currencyCode,
      defaults.baseCurrency,
      data.fxRateToBase,
    );
    const lines = await prepareSalesLines(supabase, data.companyId, data.lines, data.quoteDate);
    const saved = await saveSalesDocument(supabase, {
      kind: "quote",
      companyId: data.companyId,
      userId,
      id: data.quoteId,
      contactId: data.contactId,
      docDate: data.quoteDate,
      expiryDate: data.expiryDate,
      number: data.quoteNumber,
      memo: data.memo,
      currencyCode,
      fxRateToBase,
      lines,
      pricing: data.pricing,
    });
    return { id: saved.id, quoteNumber: saved.number };
  });

export type QuoteDetail = {
  id: string;
  price_list_id: string | null;
  price_list_name_snapshot: string | null;
  quote_number: string | null;
  quote_date: string;
  expiry_date: string | null;
  status: string;
  memo: string | null;
  currency_code: string;
  contact_id: string;
  subtotal_minor: number;
  tax_minor: number;
  total_minor: number;
  converted_invoice_id: string | null;
  sent_at: string | null;
  accepted_at: string | null;
  contacts: { id: string; name: string; email: string | null } | null;
  sales_quote_lines: Array<{
    id: string;
    line_order: number;
    description: string;
    account_id: string;
    quantity: number;
    unit_price_minor: number;
    pricing_snapshot?: PriceListLineSnapshot | null;
    discount_minor: number;
    tax_rate_bps: number;
    tax_code_id: string | null;
    product_id: string | null;
    net_minor: number;
    tax_minor: number;
    gross_minor: number;
  }>;
};

export const getQuote = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; quoteId: string }) => ({
    companyId: assertUuid(input.companyId),
    quoteId: assertUuid(input.quoteId, "quote"),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    const { data: row, error } = await context.supabase
      .from("sales_quotes" as never)
      .select("*, contacts(id, name, email), sales_quote_lines(*)" as never)
      .eq("id" as never, data.quoteId as never)
      .eq("company_id" as never, data.companyId as never)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Quote not found");
    const qr = row as unknown as { sales_quote_lines: Array<{ line_order: number; id: string }> };
    return {
      ...(row as unknown as Record<string, unknown>),
      sales_quote_lines: sortLines(qr.sales_quote_lines ?? []),
    } as unknown as QuoteDetail;
  });

export const updateQuoteStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; quoteId: string; status: string }) => {
    const status = (input.status ?? "").trim();
    if (!isQuoteStatus(status)) throw new Error("Invalid quote status");
    return {
      companyId: assertUuid(input.companyId),
      quoteId: assertUuid(input.quoteId, "quote"),
      status,
    };
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertCompanyPermission(supabase, data.companyId, "sales.draft");
    const { data: existing, error } = await supabase
      .from("sales_quotes" as never)
      .select("id, status, converted_invoice_id" as never)
      .eq("id" as never, data.quoteId as never)
      .eq("company_id" as never, data.companyId as never)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!existing) throw new Error("Quote not found");
    const q = existing as { status: string; converted_invoice_id: string | null };
    if (q.converted_invoice_id) throw new Error("Converted quotes cannot change status");
    assertQuoteTransition(q.status, data.status);

    const nowIso = new Date().toISOString();
    const run = (extra: Record<string, string>) =>
      supabase
        .from("sales_quotes" as never)
        .update({ status: data.status, updated_at: nowIso, ...extra } as never)
        .eq("id" as never, data.quoteId as never)
        .eq("company_id" as never, data.companyId as never)
        .eq("status" as never, q.status as never) // lost-update guard
        .select("id");
    let res = await run(quoteTimestampColumns(data.status, nowIso));
    if (res.error?.code === "42703") res = await run({}); // timestamp columns not migrated yet
    if (res.error) throw new Error(res.error.message);
    if (!res.data || (res.data as unknown[]).length === 0) {
      throw new Error("Quote changed in the meantime — reload and retry");
    }
    return { id: data.quoteId, status: data.status };
  });

export const deleteDraftQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; quoteId: string }) => ({
    companyId: assertUuid(input.companyId),
    quoteId: assertUuid(input.quoteId, "quote"),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "sales.draft");
    await deleteDraftDocument(context.supabase, data.companyId, "quote", data.quoteId);
    return { ok: true };
  });

export const convertQuoteToInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; quoteId: string; dueDate?: string }) => ({
    companyId: assertUuid(input.companyId),
    quoteId: assertUuid(input.quoteId),
    dueDate: optionalIsoDate(input.dueDate, "Due date"),
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCompanyPermission(supabase, data.companyId, "sales.draft");
    const { data: quote, error } = await supabase
      .from("sales_quotes" as never)
      .select("*, sales_quote_lines(*)" as never)
      .eq("id" as never, data.quoteId as never)
      .eq("company_id" as never, data.companyId as never)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!quote) throw new Error("Quote not found");
    const q = quote as unknown as {
      status: string;
      contact_id: string;
      expiry_date: string | null;
      currency_code: string;
      fx_rate_to_base?: number | null;
      memo: string | null;
      converted_invoice_id: string | null;
      sales_quote_lines: Array<{
        line_order: number;
        description: string;
        account_id: string;
        quantity: number;
        unit_price_minor: number;
        discount_minor: number;
        tax_rate_bps: number;
        tax_code_id: string | null;
        product_id: string | null;
      }>;
    };
    const defaults = await loadCompanyDefaults(supabase, data.companyId);
    const today = defaults.today;
    const ok = isQuoteConvertible(q, today);
    if (!ok.ok) throw new Error(ok.reason);

    const terms = await customerTerms(supabase, data.companyId, q.contact_id);
    const due = data.dueDate ?? addDaysIso(today, terms);
    if (due < today) throw new Error("Due date cannot be before the invoice date");
    const { currencyCode, fxRateToBase } = normaliseCurrencyAndFx(
      q.currency_code,
      defaults.baseCurrency,
      q.fx_rate_to_base ?? 1,
    );
    const { loadSalesTaxCodes } = await import("@/lib/sales/tax-codes");
    const available = new Set(
      (await loadSalesTaxCodes(supabase, data.companyId, today)).map((c) => c.id),
    );
    // Totals are recalculated from the quote lines under the CURRENT tax treatment.
    const lines = await prepareSalesLines(
      supabase,
      data.companyId,
      sortLines(q.sales_quote_lines).map((l) => ({
        description: l.description,
        accountId: l.account_id,
        quantity: Number(l.quantity),
        unitPriceMinor: Number(l.unit_price_minor),
        discountMinor: Number(l.discount_minor),
        taxRateBps: Number(l.tax_rate_bps),
        taxCodeId: l.tax_code_id && available.has(l.tax_code_id) ? l.tax_code_id : null,
        productId: l.product_id ?? null,
      })),
      today,
    );
    // The quote is claimed inside the same transaction as the invoice insert.
    const saved = await saveSalesDocument(supabase, {
      kind: "invoice",
      companyId: data.companyId,
      userId,
      contactId: q.contact_id,
      docDate: today,
      dueDate: due,
      memo: q.memo,
      currencyCode,
      fxRateToBase,
      quoteId: data.quoteId,
      lines,
    });
    return { invoiceId: saved.id };
  });

/**
 * CSV-to-invoice domain import. Drafts use saveInvoiceDraftCore and optional AR
 * posting uses authoriseInvoiceCore. Never inserts journals from CSV.
 * Repeated external numbers are skipped; the database's company-scoped,
 * case-insensitive unique invoice-number index protects concurrent writers.
 *
 * Import is per-document (NOT atomic across the entire batch). Failures are
 * returned with source row and draft ID so a partially-posted draft can be
 * inspected without generating a duplicate.
 */
export const importSalesInvoicesCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; csvText: string; authorise?: boolean }) => {
    if (typeof input?.csvText !== "string" || input.csvText.length > 5 * 1024 * 1024) {
      throw new Error("Invalid CSV or file exceeds 5 MB");
    }
    return {
      companyId: assertUuid(input.companyId),
      csvText: input.csvText,
      authorise: input.authorise === true,
    };
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertCompanyPermission(supabase, data.companyId, "sales.draft");
    if (data.authorise) await assertCompanyPermission(supabase, data.companyId, "sales.authorise");
    const defaults = await loadCompanyDefaults(supabase, data.companyId);
    const docs = prepareTransactionCsv(data.csvText, "sales", defaults.baseCurrency);
    // Do not silently truncate the external identifier supplied in CSV.
    for (const doc of docs) {
      if (doc.documentNumber.length > 40) {
        throw new Error(`Row ${doc.lines[0]!.sourceRow}: invoice number exceeds 40 characters`);
      }
    }

    // Resolve ALL references before writing any invoice.
    const accounts = new Map<string, string>();
    for (const code of new Set(docs.flatMap((d) => d.lines.map((l) => l.accountCode)))) {
      const { data: rows, error } = await supabase
        .from("accounts" as never)
        .select("id, account_type, is_active, is_postable, archived_at" as never)
        .eq("company_id" as never, data.companyId as never)
        .eq("code" as never, code as never)
        .limit(2);
      if (error) throw new Error(error.message);
      const available = (rows ?? []) as Array<{
        id: string;
        account_type: string;
        is_active: boolean;
        is_postable: boolean;
        archived_at: string | null;
      }>;
      if (
        available.length !== 1 ||
        !available[0]!.is_active ||
        !available[0]!.is_postable ||
        available[0]!.archived_at ||
        available[0]!.account_type !== "income"
      ) {
        throw new Error(
          `Account ${code} must resolve to one active postable income account in this organisation`,
        );
      }
      accounts.set(code, available[0]!.id);
    }
    const contacts = new Map<string, string>();
    for (const name of new Set(docs.map((d) => d.contactName))) {
      const { data: rows, error } = await supabase
        .from("contacts" as never)
        .select("id" as never)
        .eq("company_id" as never, data.companyId as never)
        .eq("name" as never, name as never)
        .in("kind" as never, ["customer", "both"] as never)
        .eq("is_active" as never, true as never)
        .limit(2);
      if (error) throw new Error(error.message);
      if ((rows ?? []).length !== 1)
        throw new Error(
          `Customer "${name}" must match exactly one active customer in this organisation`,
        );
      contacts.set(name, ((rows ?? []) as Array<{ id: string }>)[0]!.id);
    }
    const codesByDate = new Map<string, Map<string, string>>();
    const ratesByDate = new Map<string, Map<string, number>>();
    for (const doc of docs) {
      if (!codesByDate.has(doc.documentDate)) {
        const codes = await loadSalesTaxCodes(supabase, data.companyId, doc.documentDate);
        codesByDate.set(doc.documentDate, new Map(codes.map((c) => [c.code, c.id])));
        ratesByDate.set(doc.documentDate, new Map(codes.map((c) => [c.code, c.rate_bps])));
      }
      for (const line of doc.lines) {
        if (line.taxCode && !codesByDate.get(doc.documentDate)!.has(line.taxCode)) {
          throw new Error(
            `Row ${line.sourceRow}: tax code ${line.taxCode} is not available for sales on ${doc.documentDate}`,
          );
        }
      }
    }

    // Validate resolved net, tax and gross totals for ALL documents before
    // writing any draft. The CSV-only check cannot know effective tax rates.
    const treatment = await loadTaxTreatment(supabase, data.companyId);
    const totalsByDocument = new Map<(typeof docs)[number], bigint>();
    for (const doc of docs) {
      totalsByDocument.set(
        doc,
        validateResolvedTransactionTotals(
          doc,
          "sales",
          doc.lines.map((line) =>
            line.taxCode ? ratesByDate.get(doc.documentDate)!.get(line.taxCode)! : 0,
          ),
          treatment,
        ).totalMinor,
      );
    }

    const outcome: {
      createdDrafts: number;
      authorised: number;
      skipped: number;
      failed: number;
      errors: Array<{ row: number; number: string; draftId: string | null; message: string }>;
      auditError: string | null;
    } = { createdDrafts: 0, authorised: 0, skipped: 0, failed: 0, errors: [], auditError: null };

    for (const doc of docs) {
      let draftId: string | null = null;
      try {
        const { data: existing, error: existingError } = await supabase
          .from("sales_invoices" as never)
          .select(
            "id, status, contact_id, invoice_date, due_date, currency_code, memo, total_minor, posted_journal_id" as never,
          )
          .eq("company_id" as never, data.companyId as never)
          .ilike("invoice_number" as never, escapeLikeLiteral(doc.documentNumber) as never)
          .neq("status" as never, "void" as never)
          .limit(1);
        if (existingError) throw new Error(existingError.message);
        if ((existing ?? []).length) {
          const prior = (
            existing as unknown as Array<{
              id: string;
              status: string;
              contact_id: string;
              invoice_date: string;
              due_date: string;
              currency_code: string;
              memo: string | null;
              total_minor: number | string;
              posted_journal_id: string | null;
            }>
          )[0]!;
          const { data: priorLines, error: priorLinesError } = await supabase
            .from("sales_invoice_lines" as never)
            .select(
              "description, account_id, quantity, unit_price_minor, tax_code_id, discount_minor, product_id" as never,
            )
            .eq("company_id" as never, data.companyId as never)
            .eq("invoice_id" as never, prior.id as never)
            .order("line_order" as never);
          if (priorLinesError) throw new Error(priorLinesError.message);
          const sameSource = isExactTransactionImportRetry(
            {
              contactId: contacts.get(doc.contactName)!,
              documentDate: doc.documentDate,
              dueDate: doc.dueDate,
              currencyCode: defaults.baseCurrency,
              lines: doc.lines.map((line) => ({
                description: line.description,
                accountId: accounts.get(line.accountCode)!,
                quantity: line.quantity,
                unitPriceMinor: line.unitPriceMinor,
                taxCodeId: line.taxCode
                  ? codesByDate.get(doc.documentDate)!.get(line.taxCode)!
                  : null,
              })),
            },
            {
              contact_id: prior.contact_id,
              document_date: prior.invoice_date,
              due_date: prior.due_date,
              currency_code: prior.currency_code,
              memo: prior.memo,
              lines: (priorLines ?? []) as never,
            },
          );
          if (!sameSource) {
            throw new Error(
              "Invoice number already exists with different header or lines; review the existing invoice",
            );
          }
          const disposition = classifyTransactionImportRetry(
            prior.status,
            prior.posted_journal_id,
            data.authorise,
          );
          if (disposition === "manual_authorisation") {
            draftId = prior.id;
            throw new Error(
              "Matching draft already exists but is not authorised; review and authorise it manually",
            );
          }
          if (disposition === "invalid") {
            throw new Error(
              "Existing invoice has an inconsistent status or missing posting journal; review and reconcile before retrying",
            );
          }
          if (prior.posted_journal_id) {
            const { data: linkedJournal, error: journalError } = await supabase
              .from("journals" as never)
              .select("id, company_id, status, source_type, source_id" as never)
              .eq("id" as never, prior.posted_journal_id as never)
              .eq("company_id" as never, data.companyId as never)
              .maybeSingle();
            if (journalError) throw new Error(journalError.message);
            if (
              !isVerifiedTransactionImportJournal(
                {
                  companyId: data.companyId,
                  documentId: prior.id,
                  journalId: prior.posted_journal_id,
                  sourceType: "sales_invoice",
                },
                (linkedJournal ?? null) as never,
              )
            ) {
              throw new Error(
                "Existing invoice posting journal cannot be verified against this organisation and invoice; reconcile manually",
              );
            }
            // A valid source link is insufficient: the journal must balance
            // and its AR control debit must equal both CSV and invoice totals.
            const { data: glLines, error: glError } = await supabase
              .from("journal_lines" as never)
              .select("company_id, journal_id, account_id, debit_minor, credit_minor" as never)
              .eq("company_id" as never, data.companyId as never)
              .eq("journal_id" as never, prior.posted_journal_id as never)
              .limit(501);
            if (glError) throw new Error(glError.message);
            const ar = await resolveArAccount(supabase as never, data.companyId);
            if (
              !isReconciledTransactionImportJournal(
                {
                  companyId: data.companyId,
                  journalId: prior.posted_journal_id,
                  controlAccountId: ar.id,
                  controlSide: "debit",
                  expectedTotalMinor: totalsByDocument.get(doc)!,
                  persistedTotalMinor: prior.total_minor,
                },
                (glLines ?? null) as never,
              )
            ) {
              throw new Error(
                "Existing invoice journal is unbalanced or AR control does not match the imported invoice total; reconcile manually",
              );
            }
          }
          outcome.skipped++;
          continue;
        }

        const input = parseInvoiceDraftInput({
          companyId: data.companyId,
          contactId: contacts.get(doc.contactName)!,
          invoiceNumber: doc.documentNumber,
          invoiceDate: doc.documentDate,
          dueDate: doc.dueDate,
          currencyCode: defaults.baseCurrency,
          lines: doc.lines.map((l) => ({
            description: l.description,
            accountId: accounts.get(l.accountCode)!,
            quantity: l.quantity,
            unitPriceMinor: l.unitPriceMinor,
            taxCodeId: l.taxCode ? codesByDate.get(doc.documentDate)!.get(l.taxCode)! : null,
          })),
        });
        const saved = await saveInvoiceDraftCore(context, input);
        draftId = saved.id;
        outcome.createdDrafts++;
        if (data.authorise) {
          await authoriseInvoiceCore(context, data.companyId, saved.id);
          outcome.authorised++;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invoice import failed";
        // Concurrent duplicate numbers are blocked by the unique index.
        // The importer reports this as a failure if the domain save cannot confirm
        // whether another actor created the invoice.
        outcome.failed++;
        outcome.errors.push({
          row: doc.lines[0]!.sourceRow,
          number: doc.documentNumber,
          draftId,
          message,
        });
      }
    }
    if (outcome.createdDrafts > 0) {
      const { error } = await supabase.rpc(
        "record_audit_event" as never,
        {
          _company_id: data.companyId,
          _action: "sales.invoices.import",
          _entity_type: "sales_invoices",
          _entity_id: null,
          _details: {
            source: "csv",
            drafts: outcome.createdDrafts,
            authorised: outcome.authorised,
            skipped: outcome.skipped,
            failed: outcome.failed,
          },
        } as never,
      );
      if (error) outcome.auditError = error.message;
    }
    return outcome;
  });
