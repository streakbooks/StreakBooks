import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { BillingDocument } from "@/lib/billing/invoice-pdf.server";

/**
 * Customer invoices and credit notes. The database checks billing.view for every read; PDFs are
 * generated once from the stored snapshot, kept in private storage and served through a link
 * that expires after a minute.
 */
const BUCKET = "billing-documents";

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

export type BillingDocumentList = {
  invoices: Array<{
    id: string;
    number: string;
    issuedAt: string;
    currency: string;
    subtotalMinor: number;
    taxMinor: number;
    totalMinor: number;
    creditedMinor: number;
    status: string;
    periodStart: string | null;
    periodEnd: string | null;
    taxLabel: string | null;
  }>;
  creditNotes: Array<{
    id: string;
    number: string;
    invoiceNumber: string;
    issuedAt: string;
    currency: string;
    totalMinor: number;
    reason: string;
  }>;
};

export const listBillingDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ companyId: z.string().uuid() }).strict().parse(input),
  )
  .handler(
    async ({ data, context }) =>
      (await callRpc(context.supabase, "billing_documents", {
        _company_id: data.companyId,
      })) as BillingDocumentList,
  );

export type ProviderInvoice = {
  id: string;
  number: string | null;
  status: string;
  currency: string;
  totalMinor: number;
  amountDueMinor: number;
  createdAt: string;
  dueAt: string | null;
  hostedInvoiceUrl: string | null;
  pdfUrl: string | null;
  /** True when this looks like a mid-cycle proration / upgrade invoice. */
  proration: boolean;
};

/**
 * Live Stripe invoices for the organisation (open, paid, void, uncollectible).
 * Complements immutable platform invoices in billing.invoices — does not duplicate them.
 */
export const listProviderInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ companyId: z.string().uuid() }).strict().parse(input),
  )
  .handler(async ({ data, context }): Promise<{ invoices: ProviderInvoice[] }> => {
    const { assertCompanyPermission } = await import("@/lib/assert-company-access");
    await assertCompanyPermission(context.supabase, data.companyId, "billing.view");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("company_subscriptions" as never)
      .select("provider, provider_customer_id" as never)
      .eq("company_id" as never, data.companyId as never)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const sub = row as { provider: string; provider_customer_id: string | null } | null;
    if (sub?.provider !== "stripe" || !sub.provider_customer_id) {
      return { invoices: [] };
    }
    const { createStripeClient } = await import("@/lib/billing/providers/stripe.server");
    const stripe = createStripeClient();
    const listed = await stripe.request(
      "GET",
      `invoices?customer=${encodeURIComponent(sub.provider_customer_id)}&limit=24`,
    );
    const rows = Array.isArray(listed["data"]) ? (listed["data"] as Record<string, unknown>[]) : [];
    const invoices: ProviderInvoice[] = rows.map((invoice) => {
      const lines = (invoice["lines"] as { data?: Record<string, unknown>[] } | undefined)?.data ?? [];
      const proration = lines.some((line) => line["proration"] === true);
      const created = Number(invoice["created"] ?? 0);
      const due = Number(invoice["due_date"] ?? 0);
      return {
        id: String(invoice["id"] ?? ""),
        number: typeof invoice["number"] === "string" ? invoice["number"] : null,
        status: String(invoice["status"] ?? "unknown"),
        currency: String(invoice["currency"] ?? "gbp").toUpperCase(),
        totalMinor: Number(invoice["total"] ?? 0),
        amountDueMinor: Number(invoice["amount_due"] ?? 0),
        createdAt: created > 0 ? new Date(created * 1000).toISOString() : new Date().toISOString(),
        dueAt: due > 0 ? new Date(due * 1000).toISOString() : null,
        hostedInvoiceUrl:
          typeof invoice["hosted_invoice_url"] === "string" ? invoice["hosted_invoice_url"] : null,
        pdfUrl: typeof invoice["invoice_pdf"] === "string" ? invoice["invoice_pdf"] : null,
        proration,
      };
    });
    return { invoices };
  });

export const documentRequest = z
  .object({ kind: z.enum(["invoice", "credit_note"]), id: z.string().uuid() })
  .strict();

/** Short-lived signed PDF link, rendered once; shared by the server function and REST v1. */
export const documentDownloadFor = createServerOnlyFn(
  async (context: { supabase: unknown }, data: z.infer<typeof documentRequest>) => {
    const doc = (await callRpc(context.supabase, "billing_document", {
      _kind: data.kind,
      _id: data.id,
    })) as BillingDocument & { companyId: string; pdfPath: string | null };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let path = doc.pdfPath;
    if (!path) {
      const { renderBillingDocumentPdf } = await import("@/lib/billing/invoice-pdf.server");
      const bytes = await renderBillingDocumentPdf(doc);
      const { createHash } = await import("node:crypto");
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const candidate = `${doc.companyId}/${data.kind}/${data.id}.pdf`;
      const upload = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(candidate, bytes, { contentType: "application/pdf", upsert: false });
      if (upload.error && !/exists/i.test(upload.error.message))
        throw new Error(upload.error.message);
      path = (await callRpc(supabaseAdmin, "billing_record_document_pdf", {
        _kind: data.kind,
        _id: data.id,
        _path: candidate,
        _sha256: sha256,
      })) as string;
    }
    const fileName = `${doc.number.replace(/[^A-Za-z0-9-]+/g, "-")}.pdf`;
    const signed = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(path, 60, { download: fileName });
    if (signed.error || !signed.data?.signedUrl) {
      throw new Error(signed.error?.message ?? "The document link could not be created.");
    }
    return { url: signed.data.signedUrl };
  },
);

export const downloadBillingDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => documentRequest.parse(input))
  .handler(({ data, context }) => documentDownloadFor(context, data));

export const setBillingTaxId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        accountId: z.string().uuid(),
        scheme: z.enum(["GSTIN", "VAT", "GST", "ABN", "NZBN", "EIN", "OTHER"]),
        taxId: z.string().trim().max(40),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await callRpc(context.supabase, "billing_set_tax_id", {
      _account_id: data.accountId,
      _scheme: data.scheme,
      _tax_id: data.taxId || null,
    });
    return { ok: true as const };
  });
