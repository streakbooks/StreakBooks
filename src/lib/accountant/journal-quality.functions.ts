import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { isoDate } from "./practice-work";
import { reviewManualJournals, type ManualJournalReviewRow } from "./journal-quality";

const queryInput = z
  .object({
    companyId: z.string().uuid(),
    from: isoDate,
    to: isoDate,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.from > value.to) {
      ctx.addIssue({ code: "custom", message: "From must be before or equal to To." });
      return;
    }
    const days =
      (Date.parse(value.to + "T00:00:00Z") - Date.parse(value.from + "T00:00:00Z")) / 86400000;
    if (days > 366)
      ctx.addIssue({ code: "custom", message: "Choose a review period of 366 days or less." });
  });

/**
 * Read-only accountant review with explicit tenant authorisation and a bounded
 * scan. Does not change posting, reconcile, or create journal adjustments.
 */
export const scanManualJournalQuality = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => queryInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounting.view");
    const { data: journals, error } = await context.supabase
      .from("journals" as never)
      .select(
        "id,journal_number,journal_date,status,source_type,memo,currency_code,reverses_journal_id,reversed_by_journal_id,journal_lines(account_id,debit_minor,credit_minor)" as never,
      )
      .eq("company_id" as never, data.companyId as never)
      .eq("status" as never, "posted" as never)
      .eq("source_type" as never, "manual" as never)
      .gte("journal_date" as never, data.from as never)
      .lte("journal_date" as never, data.to as never)
      .order("journal_date" as never, { ascending: false })
      .order("journal_number" as never, { ascending: false })
      .limit(501);
    if (error) throw new Error(error.message);

    const candidates = (journals ?? []) as ManualJournalReviewRow[];
    const scanned = candidates.slice(0, 500);
    const limited = candidates.length > 500;
    return {
      from: data.from,
      to: data.to,
      scanned: scanned.length,
      limited,
      findings: reviewManualJournals(scanned),
      disclaimer:
        "Suggestions cover only the scanned posted manual journals. Possible duplicates are not confirmed errors. Never reverse or reclassify an entry solely from this report.",
    };
  });
