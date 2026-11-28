import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import {
  isPostingJournalEntityType,
  postingJournalSourceTypes,
  type PostingJournalEntityType,
} from "@/lib/documents/posting-journal-sources";

export type DocumentPostingJournal = {
  id: string;
  journal_number: number;
  journal_date: string;
  status: string;
  memo: string | null;
  source_type: string;
  currency_code: string | null;
  reverses_journal_id: string | null;
  reversed_by_journal_id: string | null;
  lines: Array<{
    id: string;
    line_no: number;
    description: string | null;
    debit_minor: string;
    credit_minor: string;
    account_code: string;
    account_name: string;
  }>;
};

type JournalDbRow = Omit<DocumentPostingJournal, "lines"> & {
  journal_lines: Array<{
    id: string;
    line_no: number;
    description: string | null;
    debit_minor: number | string;
    credit_minor: number | string;
    accounts: { code: string; name: string } | null;
  }>;
};

const JOURNAL_SELECT =
  "id, journal_number, journal_date, status, memo, source_type, currency_code, reverses_journal_id, reversed_by_journal_id, journal_lines(id, line_no, description, debit_minor, credit_minor, accounts(code, name))";

/**
 * Read only. Ledger details are visible to accounting.view users, not merely
 * to everyone who can open the source sales/purchase document. Both journal
 * queries are company-scoped; RLS remains the additional database boundary.
 * Reversals are retrieved by their explicit link to the original journal.
 */
export const listDocumentPostingJournals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { companyId: string; entityType: PostingJournalEntityType; entityId: string }) => {
      if (!isPostingJournalEntityType(input?.entityType)) {
        throw new Error("Unsupported journal document type");
      }
      return {
        companyId: assertUuid(input.companyId),
        entityType: input.entityType,
        entityId: assertUuid(input.entityId, "document"),
      };
    },
  )
  .handler(async ({ data, context }): Promise<DocumentPostingJournal[]> => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounting.view");
    const sources = postingJournalSourceTypes(data.entityType);
    if (!sources.length) return [];

    const query = context.supabase
      .from("journals" as never)
      .select(JOURNAL_SELECT as never)
      .eq("company_id" as never, data.companyId as never);

    const directResult =
      data.entityType === "journal"
        ? await query.eq("id" as never, data.entityId as never).limit(20)
        : await query
            .eq("source_id" as never, data.entityId as never)
            .in("source_type" as never, [...sources] as never)
            .limit(20);
    if (directResult.error) throw new Error(directResult.error.message);

    const direct = (directResult.data ?? []) as unknown as JournalDbRow[];
    if (direct.length === 0) return [];

    const ids = direct.map((j) => j.id);
    const { data: reverseRows, error: reverseError } = await context.supabase
      .from("journals" as never)
      .select(JOURNAL_SELECT as never)
      .eq("company_id" as never, data.companyId as never)
      .in("reverses_journal_id" as never, ids as never)
      .limit(20);
    if (reverseError) throw new Error(reverseError.message);

    const combined = new Map<string, JournalDbRow>();
    for (const row of [...direct, ...((reverseRows ?? []) as unknown as JournalDbRow[])]) {
      combined.set(row.id, row);
    }
    return [...combined.values()]
      .sort(
        (a, b) =>
          a.journal_date.localeCompare(b.journal_date) || a.journal_number - b.journal_number,
      )
      .map(({ journal_lines, ...j }) => ({
        ...j,
        lines: (journal_lines ?? [])
          .slice()
          .sort((a, b) => a.line_no - b.line_no)
          .map((line) => ({
            id: line.id,
            line_no: line.line_no,
            description: line.description,
            debit_minor: String(line.debit_minor),
            credit_minor: String(line.credit_minor),
            account_code: line.accounts?.code ?? "",
            account_name: line.accounts?.name ?? "",
          })),
      }));
  });
