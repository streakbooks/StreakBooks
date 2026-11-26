import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { assertFirmScope, firmScope } from "@/lib/firm/firm-assignments.functions";

const billingScope = firmScope.extend({ billingCompanyId: z.string().uuid() });
const engagementScope = firmScope.extend({ engagementId: z.string().uuid() });

export type PracticeBillingInvoice = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  status: string;
  currency_code: string;
  total_minor: number;
};
export type EngagementInvoiceLink = {
  engagement_id: string;
  invoice_id: string;
  billing_company_id: string;
  sales_invoices: PracticeBillingInvoice | null;
};

export const listPracticeBillingInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => billingScope.parse(input))
  .handler(async ({ data, context }): Promise<PracticeBillingInvoice[]> => {
    await assertFirmScope(context.supabase, context.userId, data.firmId, data.companyId, false);
    if (data.companyId === data.billingCompanyId)
      throw new Error("Select your practice billing organisation, not the client organisation");
    await assertCompanyPermission(context.supabase, data.billingCompanyId, "sales.view");
    const { data: rows, error } = await context.supabase
      .from("sales_invoices")
      .select("id,invoice_number,invoice_date,status,currency_code,total_minor")
      .eq("company_id", data.billingCompanyId)
      .order("invoice_date", { ascending: false })
      .limit(101);
    if (error) throw new Error(error.message);
    if ((rows ?? []).length > 100)
      throw new Error("Invoice picker exceeds 100; use a more recent billing period");
    return (rows ?? []) as PracticeBillingInvoice[];
  });

export const listEngagementInvoiceLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => engagementScope.parse(input))
  .handler(async ({ data, context }): Promise<EngagementInvoiceLink[]> => {
    await assertFirmScope(context.supabase, context.userId, data.firmId, data.companyId, false);
    const { data: record, error: engagementError } = await context.supabase
      .from("firm_engagements" as never)
      .select("id" as never)
      .eq("id" as never, data.engagementId as never)
      .eq("firm_id" as never, data.firmId as never)
      .eq("company_id" as never, data.companyId as never)
      .maybeSingle();
    if (engagementError) throw new Error(engagementError.message);
    if (!record) throw new Error("Engagement not found");
    const { data: rows, error } = await context.supabase
      .from("firm_engagement_invoice_links" as never)
      .select(
        "engagement_id,invoice_id,billing_company_id,sales_invoices(id,invoice_number,invoice_date,status,currency_code,total_minor)" as never,
      )
      .eq("engagement_id" as never, data.engagementId as never)
      .eq("firm_id" as never, data.firmId as never)
      .eq("company_id" as never, data.companyId as never)
      .limit(101);
    if (error) throw new Error(error.message);
    if ((rows ?? []).length > 100) throw new Error("Too many invoice references");
    return (rows ?? []) as EngagementInvoiceLink[];
  });

const linkInput = billingScope.extend({
  engagementId: z.string().uuid(),
  invoiceId: z.string().uuid(),
});
export const linkFirmEngagementInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => linkInput.parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    await assertFirmScope(sb, context.userId, data.firmId, data.companyId, true);
    if (data.companyId === data.billingCompanyId)
      throw new Error("Never issue a practice invoice from your client's books");
    await assertCompanyPermission(sb, data.billingCompanyId, "sales.draft");
    const { data: engagement, error: engError } = await sb
      .from("firm_engagements" as never)
      .select("id" as never)
      .eq("id" as never, data.engagementId as never)
      .eq("firm_id" as never, data.firmId as never)
      .eq("company_id" as never, data.companyId as never)
      .maybeSingle();
    if (engError) throw new Error(engError.message);
    if (!engagement) throw new Error("Engagement not found in this client");
    const { data: invoice, error: invoiceError } = await sb
      .from("sales_invoices")
      .select("id")
      .eq("id", data.invoiceId)
      .eq("company_id", data.billingCompanyId)
      .maybeSingle();
    if (invoiceError) throw new Error(invoiceError.message);
    if (!invoice) throw new Error("Invoice must exist in your practice billing organisation");
    const { error } = await sb
      .from("firm_engagement_invoice_links" as never)
      .upsert(
        {
          engagement_id: data.engagementId,
          invoice_id: data.invoiceId,
          firm_id: data.firmId,
          company_id: data.companyId,
          billing_company_id: data.billingCompanyId,
          created_by: context.userId,
        } as never,
        { onConflict: "engagement_id,invoice_id", ignoreDuplicates: true },
      )
      .select("invoice_id" as never)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { linked: true };
  });

export const unlinkFirmEngagementInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => linkInput.parse(input))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    await assertFirmScope(sb, context.userId, data.firmId, data.companyId, true);
    await assertCompanyPermission(sb, data.billingCompanyId, "sales.draft");
    const { data: removed, error } = await sb
      .from("firm_engagement_invoice_links" as never)
      .delete()
      .eq("engagement_id" as never, data.engagementId as never)
      .eq("invoice_id" as never, data.invoiceId as never)
      .eq("firm_id" as never, data.firmId as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("billing_company_id" as never, data.billingCompanyId as never)
      .select("invoice_id" as never);
    if (error) throw new Error(error.message);
    if ((removed ?? []).length !== 1)
      throw new Error("Invoice reference not found or access denied");
    return { unlinked: true };
  });
