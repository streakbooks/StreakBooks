import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { assertFirmScope, firmScope } from "@/lib/firm/firm-assignments.functions";
import {
  compatiblePracticeRecurring,
  practiceDraftDue,
  type PracticeRecurringSchedule,
} from "@/lib/firm/practice-recurring-rules";
import type { FirmEngagement } from "@/lib/firm/firm-workflows.functions";

const scope = firmScope.extend({
  billingCompanyId: z.string().uuid(),
  engagementId: z.string().uuid(),
});
const linkInput = scope.extend({ recurringId: z.string().uuid() });
type Db = Parameters<typeof assertCompanyPermission>[0];

export type PracticeRecurringLink = {
  engagement_id: string;
  recurring_id: string;
  billing_company_id: string;
  sales_recurring_invoices: PracticeRecurringSchedule | null;
};

async function checkClientBilling(
  db: Db,
  userId: string,
  data: { firmId: string; companyId: string; billingCompanyId: string },
  admin: boolean,
) {
  await assertFirmScope(db, userId, data.firmId, data.companyId, admin);
  if (data.companyId === data.billingCompanyId)
    throw new Error("A practice fee must not be billed from the client's accounting company");
  await assertCompanyPermission(db, data.billingCompanyId, admin ? "sales.draft" : "sales.view");
}

async function loadEngagement(
  db: Db,
  data: { firmId: string; companyId: string; engagementId: string },
): Promise<FirmEngagement> {
  const { data: row, error } = await db
    .from("firm_engagements" as never)
    .select("id,firm_id,company_id,status,frequency,agreed_fee,currency_code" as never)
    .eq("id" as never, data.engagementId as never)
    .eq("firm_id" as never, data.firmId as never)
    .eq("company_id" as never, data.companyId as never)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Engagement not found in the authorised client");
  return row as FirmEngagement;
}

async function loadRecurring(db: Db, billingCompanyId: string, recurringId: string) {
  const { data: row, error } = await db
    .from("sales_recurring_invoices" as never)
    .select(
      "id,name,company_id,frequency,next_due_date,is_active,auto_authorise,currency_code" as never,
    )
    .eq("id" as never, recurringId as never)
    .eq("company_id" as never, billingCompanyId as never)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Recurring invoice was not found in the practice billing company");
  return row as PracticeRecurringSchedule;
}

export const listFirmPracticeRecurringTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((value: unknown) =>
    firmScope.extend({ billingCompanyId: z.string().uuid() }).parse(value),
  )
  .handler(async ({ data, context }): Promise<PracticeRecurringSchedule[]> => {
    await checkClientBilling(context.supabase, context.userId, data, false);
    const { data: rows, error } = await context.supabase
      .from("sales_recurring_invoices" as never)
      .select(
        "id,name,company_id,frequency,next_due_date,is_active,auto_authorise,currency_code" as never,
      )
      .eq("company_id" as never, data.billingCompanyId as never)
      .order("name" as never)
      .limit(101);
    if (error) throw new Error(error.message);
    if ((rows ?? []).length > 100)
      throw new Error(
        "Billing company has more than 100 recurring templates; narrow the selection",
      );
    return (rows ?? []) as PracticeRecurringSchedule[];
  });

export const listFirmEngagementRecurringLinks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((value: unknown) => scope.parse(value))
  .handler(async ({ data, context }): Promise<PracticeRecurringLink[]> => {
    await checkClientBilling(context.supabase, context.userId, data, false);
    await loadEngagement(context.supabase, data);
    const { data: rows, error } = await context.supabase
      .from("firm_engagement_recurring_links" as never)
      .select(
        "engagement_id,recurring_id,billing_company_id,sales_recurring_invoices(id,name,company_id,frequency,next_due_date,is_active,auto_authorise,currency_code)" as never,
      )
      .eq("engagement_id" as never, data.engagementId as never)
      .eq("firm_id" as never, data.firmId as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("billing_company_id" as never, data.billingCompanyId as never)
      .limit(21);
    if (error) throw new Error(error.message);
    if ((rows ?? []).length > 20) throw new Error("Too many recurring links on this engagement");
    return (rows ?? []) as PracticeRecurringLink[];
  });

export const linkFirmEngagementRecurring = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((value: unknown) => linkInput.parse(value))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    await checkClientBilling(db, context.userId, data, true);
    const engagement = await loadEngagement(db, data);
    const recurring = await loadRecurring(db, data.billingCompanyId, data.recurringId);
    if (!compatiblePracticeRecurring(engagement, recurring)) {
      throw new Error(
        "Select an active, draft-only recurring schedule matching the engagement frequency and currency",
      );
    }
    const { error } = await db.from("firm_engagement_recurring_links" as never).upsert(
      {
        firm_id: data.firmId,
        company_id: data.companyId,
        billing_company_id: data.billingCompanyId,
        engagement_id: data.engagementId,
        recurring_id: data.recurringId,
        created_by: context.userId,
      } as never,
      { onConflict: "engagement_id,recurring_id", ignoreDuplicates: true },
    );
    if (error) throw new Error(error.message);
    return { linked: true };
  });

export const unlinkFirmEngagementRecurring = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((value: unknown) => linkInput.parse(value))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    await checkClientBilling(db, context.userId, data, true);
    const { data: removed, error } = await db
      .from("firm_engagement_recurring_links" as never)
      .delete()
      .eq("firm_id" as never, data.firmId as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("billing_company_id" as never, data.billingCompanyId as never)
      .eq("engagement_id" as never, data.engagementId as never)
      .eq("recurring_id" as never, data.recurringId as never)
      .select("recurring_id" as never);
    if (error) throw new Error(error.message);
    if ((removed ?? []).length !== 1) throw new Error("Recurring link not found");
    return { unlinked: true };
  });

/** Explicit manual run. The existing sales generator owns invoice amounts,
 * posting permissions, idempotency and document numbering. */
export const generateFirmEngagementDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((value: unknown) => linkInput.parse(value))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    await checkClientBilling(db, context.userId, data, true);
    const { data: linked, error: linkedError } = await db
      .from("firm_engagement_recurring_links" as never)
      .select("recurring_id" as never)
      .eq("firm_id" as never, data.firmId as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("billing_company_id" as never, data.billingCompanyId as never)
      .eq("engagement_id" as never, data.engagementId as never)
      .eq("recurring_id" as never, data.recurringId as never)
      .maybeSingle();
    if (linkedError) throw new Error(linkedError.message);
    if (!linked)
      throw new Error("The recurring schedule must be linked before generating an invoice");

    const engagement = await loadEngagement(db, data);
    const recurring = await loadRecurring(db, data.billingCompanyId, data.recurringId);
    if (!compatiblePracticeRecurring(engagement, recurring))
      throw new Error("Engagement and recurring schedule are no longer eligible");
    if (!practiceDraftDue(recurring, new Date().toISOString().slice(0, 10)))
      throw new Error("The next invoice is not due yet");

    const { data: v2, error: v2Error } = await db
      .from("recurring_templates" as never)
      .select("id,recurring_schedules(auto_authorise,is_paused)" as never)
      .eq("company_id" as never, data.billingCompanyId as never)
      .eq("legacy_sales_recurring_invoice_id" as never, data.recurringId as never)
      .maybeSingle();
    if (v2Error) throw new Error(v2Error.message);
    if (v2) {
      type ScheduleFlags = { auto_authorise: boolean; is_paused: boolean };
      const record = v2 as {
        recurring_schedules: ScheduleFlags[] | ScheduleFlags | null;
      };
      const schedules = record.recurring_schedules;
      const rows = schedules ? (Array.isArray(schedules) ? schedules : [schedules]) : [];
      if (rows.some((row) => row.auto_authorise || row.is_paused)) {
        throw new Error(
          "Automatic authorization or paused schedule is not allowed for this practice workflow",
        );
      }
    }
    const { generateSalesInvoiceFromRecurring } =
      await import("@/lib/recurring/generate-sales-invoice");
    const generated = await generateSalesInvoiceFromRecurring(
      db as never,
      context.userId,
      data.billingCompanyId,
      data.recurringId,
      { forceDraft: true },
    );

    // The invoice already exists at this point; report a linkage failure without
    // lying that generation failed or generating a duplicate on blind retry.
    const { error: linkError } = await db.from("firm_engagement_invoice_links" as never).upsert(
      {
        firm_id: data.firmId,
        company_id: data.companyId,
        engagement_id: data.engagementId,
        billing_company_id: data.billingCompanyId,
        invoice_id: generated.invoiceId,
        created_by: context.userId,
      } as never,
      { onConflict: "engagement_id,invoice_id", ignoreDuplicates: true },
    );
    return {
      invoiceId: generated.invoiceId,
      nextDueDate: generated.nextDueDate,
      linked: !linkError,
      linkWarning: linkError?.message ?? null,
    };
  });
