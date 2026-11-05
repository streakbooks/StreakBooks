/**
 * Read-only verification of recent realised foreign exchange posting records against
 * their authoritative posted journal and journal lines. Does not reconstruct FX rates
 * or revalue balances, and does not mutate accounting records.
 */
export type FxMinor = string | number;
export type FxRealisedAuditRow = {
  id: string;
  kind: "sales" | "purchases";
  allocation_id: string;
  currency_code: string;
  gain_loss_base_minor: FxMinor;
  journal_id: string | null;
  reversal_journal_id: string | null;
  reversed_at: string | null;
};
export type FxRealisedAuditJournal = {
  id: string;
  status: string;
  source_type: string;
  source_id: string | null;
  idempotency_key: string | null;
  reversed_by_journal_id: string | null;
};
export type FxRealisedAuditLine = {
  journal_id: string;
  debit_minor: FxMinor;
  credit_minor: FxMinor;
};
export type FxRealisedAuditTag = {
  journal_id: string;
  kind: string;
  currency_code: string;
};
export type FxRealisedAuditResult = {
  rowsChecked: number;
  limit: number;
  hasMore: boolean;
  exceptions: number;
  rows: Array<{
    recordId: string;
    journalId: string | null;
    currencyCode: string;
    gainLossMinor: string | null;
    status: "matched" | "reversed" | "mismatch";
    issues: string[];
  }>;
};

function signedMinor(input: FxMinor): bigint | null {
  if (typeof input === "number") {
    return Number.isSafeInteger(input) ? BigInt(input) : null;
  }
  return /^-?(0|[1-9][0-9]*)$/.test(input) ? BigInt(input) : null;
}

/** Audits only one already-limited snapshot; never claims to cover all history. */
export function auditRealisedFxJournals(
  records: readonly FxRealisedAuditRow[],
  journals: readonly FxRealisedAuditJournal[],
  lines: readonly FxRealisedAuditLine[],
  tags: readonly FxRealisedAuditTag[],
  limit = 50,
  hasMore = false,
): FxRealisedAuditResult {
  const journalById = new Map(journals.map((journal) => [journal.id, journal]));
  const tagByJournal = new Map(tags.map((tag) => [tag.journal_id, tag]));
  const linesByJournal = new Map<string, FxRealisedAuditLine[]>();
  for (const line of lines) {
    const list = linesByJournal.get(line.journal_id) ?? [];
    list.push(line);
    linesByJournal.set(line.journal_id, list);
  }
  const seenIds = new Set<string>();
  const rows = records.map((record) => {
    const issues: string[] = [];
    const amount = signedMinor(record.gain_loss_base_minor);
    const expected = amount === null ? null : amount < 0n ? -amount : amount;
    if (expected === null || expected === 0n) {
      issues.push("Realised FX adjustment must have a nonzero exact minor-unit amount.");
    }
    const id = record.journal_id;
    if (!id) {
      issues.push("Nonzero realised FX adjustment has no linked journal.");
    } else {
      if (seenIds.has(id)) issues.push("Journal is linked to multiple FX posting records.");
      seenIds.add(id);
      const journal = journalById.get(id);
      if (!journal) {
        issues.push("Linked journal is missing or cannot be accessed.");
      } else {
        if (journal.status !== "posted") issues.push("FX journal is not posted.");
        if (journal.source_type !== "fx_realised" || journal.source_id !== record.allocation_id) {
          issues.push("Journal source is not this realised FX allocation.");
        }
        if (journal.idempotency_key !== `fx_realised:${record.kind}:${record.allocation_id}:post`) {
          issues.push("Journal idempotency reference does not match this FX posting.");
        }
        if (record.reversed_at && !journal.reversed_by_journal_id) {
          issues.push("FX record is reversed but its posted journal lacks a reversal.");
        }
        if (!record.reversed_at && journal.reversed_by_journal_id) {
          issues.push("FX journal is reversed but the FX record is still active.");
        }
        if (
          record.reversal_journal_id &&
          record.reversal_journal_id !== journal.reversed_by_journal_id
        ) {
          issues.push("FX reversal journal reference does not match the original journal.");
        }
      }
      const tag = tagByJournal.get(id);
      if (
        !tag ||
        tag.kind !== "realised" ||
        tag.currency_code.trim().toUpperCase() !== record.currency_code.trim().toUpperCase()
      ) {
        issues.push("FX journal currency tag is missing or does not match.");
      }
      const journalLines = linesByJournal.get(id) ?? [];
      if (journalLines.length !== 2 || expected === null || expected === 0n) {
        issues.push("FX journal must have exactly two verifiable adjustment lines.");
      } else {
        const debit = journalLines.filter(
          (line) =>
            signedMinor(line.debit_minor) === expected && signedMinor(line.credit_minor) === 0n,
        );
        const credit = journalLines.filter(
          (line) =>
            signedMinor(line.credit_minor) === expected && signedMinor(line.debit_minor) === 0n,
        );
        if (debit.length !== 1 || credit.length !== 1) {
          issues.push("Posted debit and credit amounts differ from recorded FX gain/loss.");
        }
      }
    }

    return {
      recordId: record.id,
      journalId: id,
      currencyCode: record.currency_code,
      gainLossMinor: amount?.toString() ?? null,
      status: issues.length
        ? ("mismatch" as const)
        : record.reversed_at
          ? ("reversed" as const)
          : ("matched" as const),
      issues,
    };
  });
  return {
    rowsChecked: records.length,
    limit,
    hasMore,
    exceptions: rows.filter((row) => row.status !== "matched").length,
    rows,
  };
}
