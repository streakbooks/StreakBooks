import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import { z } from "zod";

const DOCUMENTS = {
  invoice: { table: "sales_invoices", entity: "sales_invoice", permission: "sales.draft" },
  quote: { table: "sales_quotes", entity: "sales_quote", permission: "sales.draft" },
  credit_note: {
    table: "sales_credit_notes",
    entity: "sales_credit_note",
    permission: "sales.draft",
  },
  bill: { table: "purchase_bills", entity: "purchase_bill", permission: "purchases.draft" },
} as const;

/** Records provenance after the existing domain save confirms success; cannot save or post. */
export const recordVoiceDraftOutcome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      companyId: string;
      recordId: string;
      module: keyof typeof DOCUMENTS;
      actionId: string;
    }) => ({
      companyId: assertUuid(input.companyId),
      recordId: assertUuid(input.recordId),
      actionId: assertUuid(input.actionId),
      module: z.enum(["invoice", "quote", "credit_note", "bill"]).parse(input.module),
    }),
  )
  .handler(async ({ data, context }) => {
    const def = DOCUMENTS[data.module];
    await assertCompanyPermission(context.supabase, data.companyId, def.permission);
    const { data: record, error } = await context.supabase
      .from(def.table as never)
      .select("id, status" as never)
      .eq("id" as never, data.recordId as never)
      .eq("company_id" as never, data.companyId as never)
      .maybeSingle();
    if (error) throw new Error("Could not verify the saved document for audit.");
    if (!record) throw new Error("Saved document not found in this organisation.");
    if ((record as { status: string }).status !== "draft")
      throw new Error("The document is no longer a draft; review its activity.");
    const result = await context.supabase.rpc(
      "record_app_audit_event" as never,
      {
        _company_id: data.companyId,
        _action: "voice_draft_saved",
        _entity_type: def.entity,
        _entity_id: data.recordId,
        _details: {
          action_id: data.actionId,
          actor_user_id: context.userId,
          source: "voice_assistant",
          outcome: "saved",
          confirmation: "on_screen",
        },
      } as never,
    );
    if (result.error)
      throw new Error("Draft saved, but its voice audit marker could not be recorded.");
    return { recorded: true };
  });
