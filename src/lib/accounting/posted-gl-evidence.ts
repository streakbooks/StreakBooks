/** Read-only posted GL evidence check. No source-document or FX valuation assurance. */
export type GlAuditJournal = {
  id: string; company_id: string; journal_number: number; journal_date: string;
  status: string; currency_code: string | null; source_type: string;
  reversed_by_journal_id: string | null; reverses_journal_id: string | null;
};
export type GlAuditLine = {
  id: string; company_id: string; journal_id: string; line_no: number;
  account_id: string; debit_minor: number | string; credit_minor: number | string;
};
export type GlAuditAccount = {
  id: string; company_id: string; code: string; name: string;
};
export type GlAuditPeriod = {
  id: string; company_id: string; start_date: string; end_date: string; status: string;
};
export type GlAuditReversal = {
  id: string; company_id: string; status: string;
  reverses_journal_id: string | null; reversed_by_journal_id: string | null;
};
export type GlAccountEvidence = {
  accountId: string; code: string; name: string; debitMinor: string; creditMinor: string;
};
export type PostedGlEvidenceResult = {
  journalId: string; journalNumber: number; status: "passed" | "exceptions" | "not_posted";
  currencyCode: string; sourceType: string; lineCount: number; accountCount: number;
  periodId: string | null; periodStatus: string | null;
  debitMinor: string | null; creditMinor: string | null;
  accounts: GlAccountEvidence[]; issues: string[];
};
function isRealIsoDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function exactMinor(raw: number | string, label: string): bigint {
  if (typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0) return BigInt(raw);
  if (typeof raw === "string" && /^\d+$/.test(raw)) return BigInt(raw);
  throw new Error(label + " is not an exact non-negative minor-unit integer.");
}
/**
 * Runs on separately retrieved company-scoped journal, lines, accounts, periods
 * and reversal records. A missing result cannot become a passing audit.
 */
export function reviewPostedGlEvidence(
  expectedCompanyId: string,
  journal: GlAuditJournal,
  lines: readonly GlAuditLine[],
  accounts: readonly GlAuditAccount[],
  periods: readonly GlAuditPeriod[],
  reversals: readonly GlAuditReversal[],
): PostedGlEvidenceResult {
  const issues: string[] = [];
  if (journal.company_id !== expectedCompanyId) issues.push("Journal organisation differs from the request.");
  if (!journal.id) issues.push("Journal identity is missing.");
  if (!Number.isSafeInteger(journal.journal_number) || journal.journal_number <= 0) {
    issues.push("Journal number is invalid.");
  }
  if (!journal.source_type?.trim()) issues.push("Journal source type is missing.");
  if (!journal.currency_code?.trim()) issues.push("Journal currency is missing.");
  if (!journal.journal_date || !isRealIsoDay(journal.journal_date)) {
    issues.push("Journal date is missing or malformed.");
  }
  const result: PostedGlEvidenceResult = {
    journalId: journal.id, journalNumber: journal.journal_number, status: "not_posted",
    currencyCode: journal.currency_code ?? "", sourceType: journal.source_type,
    lineCount: lines.length, accountCount: 0, periodId: null, periodStatus: null,
    debitMinor: null, creditMinor: null, accounts: [], issues,
  };
  if (journal.status !== "posted") {
    if (issues.length) result.status = "exceptions";
    return result;
  }
  if (lines.length < 2) issues.push("Posted journal has fewer than two ledger lines.");
  const matchingPeriods = periods.filter((period) => {
    if (period.company_id !== expectedCompanyId) {
      issues.push("Accounting period belongs to a different organisation.");
      return false;
    }
    if (!period.id || !isRealIsoDay(period.start_date) ||
        !isRealIsoDay(period.end_date) || period.start_date > period.end_date ||
        !period.status?.trim()) {
      issues.push("Accounting period evidence is malformed.");
      return false;
    }
    return period.start_date <= journal.journal_date && period.end_date >= journal.journal_date;
  });
  if (matchingPeriods.length !== 1) {
    issues.push("Posted journal date must belong to exactly one accounting period.");
  } else {
    result.periodId = matchingPeriods[0]!.id;
    result.periodStatus = matchingPeriods[0]!.status;
  }
  const accountMap = new Map<string, GlAuditAccount>();
  for (const account of accounts) {
    if (!account.id || account.company_id !== expectedCompanyId || accountMap.has(account.id)) {
      issues.push("Account evidence is duplicated or belongs to another organisation.");
    } else {
      accountMap.set(account.id, account);
    }
  }
  const seenIds = new Set<string>();
  const seenNumbers = new Set<number>();
  const totalByAccount = new Map<string, { debit: bigint; credit: bigint }>();
  let debits = 0n;
  let credits = 0n;
  for (const [index, line] of lines.entries()) {
    const label = "Ledger line " + (index + 1);
    if (line.company_id !== expectedCompanyId || line.journal_id !== journal.id) {
      issues.push(label + " belongs to a different journal or organisation.");
    }
    if (!line.id || seenIds.has(line.id)) issues.push(label + " has a missing or duplicate ID.");
    seenIds.add(line.id);
    if (!Number.isSafeInteger(line.line_no) || line.line_no < 1 || seenNumbers.has(line.line_no)) {
      issues.push(label + " has an invalid or duplicate line number.");
    }
    seenNumbers.add(line.line_no);
    const account = accountMap.get(line.account_id);
    if (!account || !account.code.trim()) issues.push(label + " has no valid organisation-owned account.");
    try {
      const debit = exactMinor(line.debit_minor, label + " debit");
      const credit = exactMinor(line.credit_minor, label + " credit");
      if ((debit === 0n && credit === 0n) || (debit > 0n && credit > 0n)) {
        issues.push(label + " has both or neither debit/credit.");
      }
      debits += debit;
      credits += credit;
      if (account) {
        const prior = totalByAccount.get(account.id) ?? { debit: 0n, credit: 0n };
        prior.debit += debit;
        prior.credit += credit;
        totalByAccount.set(account.id, prior);
      }
    } catch (error) {
      issues.push(error instanceof Error ? error.message : label + " has invalid monetary data.");
    }
  }
  for (const account of accountMap.values()) {
    if (!totalByAccount.has(account.id)) {
      issues.push("Account evidence includes an unreferenced account.");
    }
  }
  if (debits === 0n || credits === 0n || debits !== credits) {
    issues.push("Posted journal debit and credit totals do not balance.");
  }
  const relatedIds = [journal.reversed_by_journal_id, journal.reverses_journal_id].filter(
    (id): id is string => Boolean(id),
  );
  const reversalMap = new Map<string, GlAuditReversal>();
  for (const reversal of reversals) {
    if (!relatedIds.includes(reversal.id) || reversal.company_id !== expectedCompanyId || reversalMap.has(reversal.id)) {
      issues.push("Related reversal evidence is unexpected, duplicated or from another organisation.");
    } else {
      reversalMap.set(reversal.id, reversal);
    }
  }
  if (journal.reversed_by_journal_id) {
    const reversal = reversalMap.get(journal.reversed_by_journal_id);
    if (!reversal || reversal.status !== "posted" || reversal.reverses_journal_id !== journal.id) {
      issues.push("Reversal journal is missing, not posted, or does not reference this journal.");
    }
  }
  if (journal.reverses_journal_id) {
    const original = reversalMap.get(journal.reverses_journal_id);
    if (!original || original.status !== "posted" || original.reversed_by_journal_id !== journal.id) {
      issues.push("Original journal is missing, not posted, or does not reference this reversal.");
    }
  }
  result.accountCount = totalByAccount.size;
  result.debitMinor = debits.toString();
  result.creditMinor = credits.toString();
  result.accounts = [...totalByAccount.entries()]
    .map(([id, sums]) => {
      const account = accountMap.get(id)!;
      return {
        accountId: id, code: account.code, name: account.name,
        debitMinor: sums.debit.toString(), creditMinor: sums.credit.toString(),
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code) || a.accountId.localeCompare(b.accountId));
  result.status = issues.length ? "exceptions" : "passed";
  return result;
}
