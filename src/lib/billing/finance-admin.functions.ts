import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Platform finance: sellers, numbering, tax rules, pending invoices and refunds. The database
 * requires an aal2 platform session, enforces second-owner approvals and audits every change.
 */
type RpcClient = {
  rpc: (
    fn: never,
    args?: never,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

async function callRpc(client: unknown, fn: string, args?: Record<string, unknown>) {
  const { data, error } = await (client as RpcClient).rpc(fn as never, args as never);
  if (error) throw new Error(error.message);
  return data;
}

const reason = z.string().trim().min(3).max(500);
const uuid = z.string().uuid();

export type FinanceOverview = {
  sellers: Array<{
    id: string;
    legal_name: string;
    trading_name: string | null;
    country_code: string;
    address_line1: string;
    address_line2: string | null;
    city: string;
    region: string | null;
    postal_code: string | null;
    tax_registrations: Array<{ scheme: string; number: string; region?: string }>;
    support_email: string | null;
    serves_countries: string[];
    is_default: boolean;
    status: string;
    created_by: string | null;
  }>;
  series: Array<{
    id: string;
    sellerId: string;
    documentType: string;
    prefix: string;
    padding: number;
    nextNumber: number;
    active: boolean;
  }>;
  taxRules: Array<{
    id: string;
    country_code: string;
    region_code: string | null;
    customer_type: string;
    tax_label: string;
    rate_bps: number;
    price_mode: string;
    treatment: string;
    invoice_note: string | null;
    basis: string;
    effective_from: string;
    effective_to: string | null;
    status: string;
    created_by: string | null;
  }>;
  payments: Array<{
    id: string;
    companyId: string;
    provider: string;
    mode: string;
    currency: string;
    amountMinor: number;
    refundedMinor: number;
    status: string;
    paidAt: string;
    invoiceNumber: string | null;
    invoiceIssueError: string | null;
  }>;
  refunds: Array<{
    id: string;
    paymentId: string;
    amountMinor: number;
    currency: string;
    reason: string;
    status: string;
    requestedBy: string;
    decidedBy: string | null;
    failure: string | null;
    createdAt: string;
  }>;
  pendingInvoices: number;
  me: string;
};

export const getFinanceOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({ context }) =>
      (await callRpc(context.supabase, "platform_finance_overview")) as FinanceOverview,
  );

const sellerInput = z
  .object({
    id: uuid.nullable(),
    legalName: z.string().trim().min(2).max(200),
    tradingName: z.string().trim().max(200),
    country: z.string().regex(/^[A-Z]{2}$/),
    line1: z.string().trim().min(2).max(200),
    line2: z.string().trim().max(200),
    city: z.string().trim().min(1).max(120),
    region: z.string().trim().max(120),
    postalCode: z.string().trim().max(20),
    supportEmail: z.string().trim().max(200),
    servesCountries: z.array(z.string().regex(/^[A-Z]{2}$/)).max(250),
    isDefault: z.boolean(),
    taxRegistrations: z
      .array(
        z.object({
          scheme: z.string().regex(/^[A-Z]{2,10}$/),
          number: z.string().trim().min(3).max(40),
        }),
      )
      .max(10),
    reason,
  })
  .strict();

export const saveSeller = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => sellerInput.parse(input))
  .handler(async ({ data, context }) => {
    const { id, reason: why, ...fields } = data;
    await callRpc(context.supabase, "platform_save_seller_entity", {
      _id: id,
      _data: fields,
      _reason: why,
    });
    return { ok: true as const };
  });

export const setSellerStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ id: uuid, status: z.enum(["active", "retired"]), reason })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await callRpc(context.supabase, "platform_set_seller_status", {
      _id: data.id,
      _status: data.status,
      _reason: data.reason,
    });
    return { ok: true as const };
  });

export const createSeries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        sellerId: uuid,
        documentType: z.enum(["invoice", "credit_note"]),
        prefix: z.string().trim().min(1).max(10),
        padding: z.number().int().min(3).max(10),
        reason,
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await callRpc(context.supabase, "platform_create_invoice_series", {
      _seller_id: data.sellerId,
      _document_type: data.documentType,
      _prefix: data.prefix,
      _padding: data.padding,
      _reason: data.reason,
    });
    return { ok: true as const };
  });

const taxRuleInput = z
  .object({
    country: z.string().regex(/^[A-Z]{2}$/),
    region: z.string().trim().max(10),
    customerType: z.enum(["ANY", "B2B", "B2C"]),
    label: z.string().trim().min(1).max(40),
    rateBps: z.number().int().min(0).max(10000),
    priceMode: z.enum(["inclusive", "exclusive"]),
    treatment: z.enum(["standard", "zero_rated", "exempt", "reverse_charge", "not_collected"]),
    invoiceNote: z.string().trim().max(500),
    basis: z.string().trim().min(3).max(1000),
    effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    effectiveTo: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
    reason,
  })
  .strict();

export const draftTaxRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => taxRuleInput.parse(input))
  .handler(async ({ data, context }) => {
    const { reason: why, ...rule } = data;
    await callRpc(context.supabase, "platform_draft_tax_rule", { _data: rule, _reason: why });
    return { ok: true as const };
  });

export const decideTaxRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ id: uuid, action: z.enum(["approve", "retire"]), reason })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await callRpc(
      context.supabase,
      data.action === "approve" ? "platform_approve_tax_rule" : "platform_retire_tax_rule",
      { _id: data.id, _reason: data.reason },
    );
    return { ok: true as const };
  });

export const issuePendingInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ reason }).strict().parse(input))
  .handler(
    async ({ data, context }) =>
      (await callRpc(context.supabase, "platform_issue_pending_invoices", {
        _reason: data.reason,
      })) as { issued: number; pending: number },
  );

export const requestRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ paymentId: uuid, amountMinor: z.number().int().min(1), reason })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await callRpc(context.supabase, "platform_request_refund", {
      _payment_id: data.paymentId,
      _amount_minor: data.amountMinor,
      _reason: data.reason,
    });
    return { ok: true as const };
  });

export const decideRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: uuid, approve: z.boolean(), reason }).strict().parse(input),
  )
  .handler(async ({ data, context }) => {
    await callRpc(context.supabase, "platform_decide_refund", {
      _refund_id: data.id,
      _approve: data.approve,
      _reason: data.reason,
    });
    return { ok: true as const };
  });

/** Sends an approved refund to the provider and records its answer with the service role. */
export const executeRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: uuid }).strict().parse(input))
  .handler(async ({ data, context }) => {
    const ref = (await callRpc(context.supabase, "platform_refund_for_execution", {
      _refund_id: data.id,
    })) as {
      refundId: string;
      provider: "stripe" | "razorpay";
      mode: "test" | "live";
      providerPaymentId: string;
      amountMinor: number;
      idempotencyKey: string;
    };
    let result: { id: string; status: "succeeded" | "pending" | "failed" };
    if (ref.provider === "stripe") {
      const { createStripeClient, createStripeRefund } =
        await import("@/lib/billing/providers/stripe.server");
      const client = createStripeClient();
      if (client.mode !== ref.mode) throw new Error(`This payment was taken in ${ref.mode} mode.`);
      result = await createStripeRefund(client, {
        paymentIntentId: ref.providerPaymentId,
        amountMinor: ref.amountMinor,
        idempotencyKey: ref.idempotencyKey,
        refundId: ref.refundId,
      });
    } else {
      const { createRazorpayClient, createRazorpayRefund } =
        await import("@/lib/billing/providers/razorpay.server");
      const client = createRazorpayClient();
      if (client.mode !== ref.mode) throw new Error(`This payment was taken in ${ref.mode} mode.`);
      result = await createRazorpayRefund(client, {
        paymentId: ref.providerPaymentId,
        amountMinor: ref.amountMinor,
        refundId: ref.refundId,
      });
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const recorded = (await callRpc(supabaseAdmin, "billing_refund_submitted", {
      _refund_id: ref.refundId,
      _provider_refund_id: result.id || null,
      _status: result.status,
      _failure: result.status === "failed" ? "The provider declined the refund" : null,
    })) as { result: string; number?: string };
    return { status: result.status, creditNote: recorded.number ?? null };
  });
