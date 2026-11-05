/**
 * Read-only verification of deferral recognition journals against posted GL lines.
 * This does not prove the originating bill/invoice balance: schedules store a
 * free-text reference rather than a foreign key to that originating document.
 */
export type MinorInput = number | string;

export type DeferralAuditSource = {
  id: string;
  name: string;
  total_minor: MinorInput;
  periods: number;
  debit_account_id: string;
  credit_account_id: string;
};

export type DeferralAuditEntry = {
  id: string;
  period_no: number;
  amount_minor: MinorInput;
  journal_id: string | null;
};

export type DeferralAuditJournal = {
  id: string;
  status: string;
  idempotency_key: string | null;
  reversed_by_journal_id: string | null;
};

export type DeferralAuditLine = {
  journal_id: string;
  account_id: string;
  debit_minor: MinorInput;
  credit_minor: MinorInput;
};

export type DeferralAuditResult = {
  scheduleId: string;
  scheduleName: string;
  totalMinor: string | null;
  allocatedMinor: string | null;
  differenceMinor: string | null;
  scheduleIssues: string[];
  entries: Array<{
    entryId: string;
    periodNo: number;
    journalId: string | null;
    status: "unposted" | "matched" | "reversed" | "mismatch";
    issues: string[];
  }>;
  exceptionCount: number;
};

function minor(value: MinorInput): bigint | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : null;
  }
  return /^(0|[1-9][0-9]*)$/.test(value) ? BigInt(value) : null;
}

/** Only exact two-line recognition journals are counted as matches. */
export function auditDeferralRecognitionJournals(
  schedule: DeferralAuditSource,
  entries: readonly DeferralAuditEntry[],
  journals: readonly DeferralAuditJournal[],
  lines: readonly DeferralAuditLine[],
): DeferralAuditResult {
  const scheduleIssues: string[] = [];
  const total = minor(schedule.total_minor);
  if (total === null) scheduleIssues.push("The schedule total cannot be represented exactly.");
  if (!Number.isInteger(schedule.periods) || entries.length !== schedule.periods) {
    scheduleIssues.push("The number of recognition periods does not match the schedule.");
  }

  const journalsById = new Map(journals.map((journal) => [journal.id, journal]));
  const linesByJournal = new Map<string, DeferralAuditLine[]>();
  for (const line of lines) {
    const existing = linesByJournal.get(line.journal_id) ?? [];
    existing.push(line);
    linesByJournal.set(line.journal_id, existing);
  }
  const seenJournalIds = new Set<string>();
  let allocated = 0n;
  let amountValid = true;

  const audited = entries.map((entry) => {
    const issues: string[] = [];
    const expected = minor(entry.amount_minor);
    if (expected === null || expected <= 0n) {
      amountValid = false;
      issues.push("Recognition amount is invalid or cannot be represented exactly.");
    } else {
      allocated += expected;
    }
    if (!entry.journal_id) {
      return {
        entryId: entry.id,
        periodNo: entry.period_no,
        journalId: null,
        status: issues.length ? ("mismatch" as const) : ("unposted" as const),
        issues,
      };
    }

    const id = entry.journal_id;
    if (seenJournalIds.has(id)) {
      issues.push("The same journal is linked to more than one recognition period.");
    }
    seenJournalIds.add(id);
    const journal = journalsById.get(id);
    if (!journal) {
      issues.push("Linked journal is missing or is not accessible.");
    } else {
      if (journal.status !== "posted") issues.push("Linked journal is not posted.");
      if (journal.idempotency_key !== `deferral:${entry.id}`) {
        issues.push("Journal does not belong to this recognition entry.");
      }
    }

    const actual = linesByJournal.get(id) ?? [];
    if (actual.length !== 2 || expected === null) {
      issues.push("The journal must contain exactly two verifiable recognition lines.");
    } else {
      const debitMatches = actual.some(
        (line) =>
          line.account_id === schedule.debit_account_id &&
          minor(line.debit_minor) === expected &&
          minor(line.credit_minor) === 0n,
      );
      const creditMatches = actual.some(
        (line) =>
          line.account_id === schedule.credit_account_id &&
          minor(line.credit_minor) === expected &&
          minor(line.debit_minor) === 0n,
      );
      if (!debitMatches || !creditMatches) {
        issues.push("Debit/credit accounts or amounts differ from the schedule.");
      }
    }

    return {
      entryId: entry.id,
      periodNo: entry.period_no,
      journalId: id,
      status: issues.length
        ? ("mismatch" as const)
        : journal?.reversed_by_journal_id
          ? ("reversed" as const)
          : ("matched" as const),
      issues,
    };
  });

  if (amountValid && total !== null && allocated !== total) {
    scheduleIssues.push("Allocated period amounts do not equal the schedule total.");
  }
  const difference = total !== null && amountValid ? allocated - total : null;
  return {
    scheduleId: schedule.id,
    scheduleName: schedule.name,
    totalMinor: total?.toString() ?? null,
    allocatedMinor: amountValid ? allocated.toString() : null,
    differenceMinor: difference?.toString() ?? null,
    scheduleIssues,
    entries: audited,
    exceptionCount:
      scheduleIssues.length +
      audited.filter((entry) => entry.status === "mismatch" || entry.status === "reversed").length,
  };
}
