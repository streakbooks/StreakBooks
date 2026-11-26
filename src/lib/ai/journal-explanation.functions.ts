import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import {
  buildJournalExplanation,
  exactJournalMinorString,
  type JournalExplanation,
  type JournalLineInput,
} from "@/lib/ai/journal-explanation";

/**
 * Read-only journal investigation endpoint. Both permissions are checked on the
 * server, independently of the browser's menu visibility. Every query is
 * restricted to the requested organisation and one posted journal.
 */
export const getAiJournalExplanation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string; journalId: string }) => ({
    companyId: assertUuid(input.companyId),
    journalId: assertUuid(input.journalId, "journal"),
  }))
  .handler(async ({ data, context }): Promise<JournalExplanation> => {
    await assertCompanyPermission(context.supabase, data.companyId, "ai.use");
    await assertCompanyPermission(context.supabase, data.companyId, "reports.view");

    const { data: journal, error: headerError } = await context.supabase
      .from("journals" as never)
      .select(
        "id, journal_number, journal_date, status, memo, source_type, source_id, currency_code, reverses_journal_id" as never,
      )
      .eq("company_id" as never, data.companyId as never)
      .eq("id" as never, data.journalId as never)
      .eq("status" as never, "posted" as never)
      .maybeSingle();
    if (headerError) throw new Error("Could not retrieve the requested posted journal");
    if (!journal) throw new Error("Posted journal not found or not accessible");

    const { data: rows, error: lineError } = await context.supabase
      .from("journal_lines" as never)
      .select(
        "id, line_no, account_id, description, debit_minor, credit_minor, accounts(code, name, account_type, is_active)" as never,
      )
      .eq("company_id" as never, data.companyId as never)
      .eq("journal_id" as never, data.journalId as never)
      .order("line_no" as never)
      .limit(201);
    if (lineError) throw new Error("Could not retrieve authorised journal lines");
    if (!rows || rows.length < 2 || rows.length > 200)
      throw new Error("This journal cannot be explained here; open the original journal detail");

    type Header = {
      id: string;
      journal_number: number;
      journal_date: string;
      status: string;
      memo: string | null;
      source_type: string;
      source_id: string | null;
      currency_code: string;
      reverses_journal_id: string | null;
    };
    type DbLine = {
      id: string;
      line_no: number;
      account_id: string;
      description: string | null;
      debit_minor: number | string;
      credit_minor: number | string;
      accounts: {
        code: string;
        name: string;
        account_type: string;
        is_active: boolean;
      } | null;
    };
    const j = journal as Header;
    const lines: JournalLineInput[] = (rows as DbLine[]).map((line) => ({
      id: line.id,
      line_no: line.line_no,
      account_id: line.account_id,
      account_code: line.accounts?.code ?? "",
      account_name: line.accounts?.name ?? "",
      account_type: line.accounts?.account_type ?? null,
      account_active: line.accounts?.is_active ?? null,
      description: line.description,
      debit_minor: exactJournalMinorString(line.debit_minor),
      credit_minor: exactJournalMinorString(line.credit_minor),
    }));
    return buildJournalExplanation({ ...j, lines });
  });
