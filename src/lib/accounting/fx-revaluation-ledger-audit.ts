/** Read-only, exact-minor-unit checks of one posted unrealised FX revaluation run.
 * The original valuation of open foreign balances is a separate calculation.
 */
export type MinorValue = string | number;

export type FxRunAuditSource = {
  id: string;
  as_of_date: string;
  reverse_on: string;
  journal_ids: string[];
  total_gain_minor: MinorValue;
  total_loss_minor: MinorValue;
};

export type FxRunAuditJournal = {
  id: string;
  status: string;
  journal_date: string;
  source_type: string;
  source_id: string | null;
  idempotency_key: string | null;
  currency_code: string;
  fx_rate_to_base: MinorValue;
  reverses_journal_id: string | null;
  reversed_by_journal_id: string | null;
};

export type FxRunAuditTag = {
  journal_id: string;
  currency_code: string;
  kind: string;
};

export type FxRunAuditReversal = {
  journal_id: string;
  origin: string;
  status: string;
  reverse_on: string;
  reversal_journal_id: string | null;
};

export type FxRunAuditLine = {
  journal_id: string;
  account_id: string;
  debit_minor: MinorValue;
  credit_minor: MinorValue;
};

export type FxRunAuditAccount = {
  id: string;
  code: string;
  name: string;
  account_type: string;
};

export type FxRunAuditItem = {
  journalId: string;
  currencyCode: string | null;
  status: "matched" | "reversed" | "exception";
  reversalStatus: string | null;
  gainMinor: string | null;
  lossMinor: string | null;
  issues: string[];
};

export type FxRunAuditReport = {
  runId: string;
  asOfDate: string;
  reverseOn: string;
  journalCount: number;
  expectedGainMinor: string | null;
  actualGainMinor: string | null;
  expectedLossMinor: string | null;
  actualLossMinor: string | null;
  differences: string[];
  exceptionCount: number;
  reversedCount: number;
  items: FxRunAuditItem[];
};

function units(value: MinorValue): bigint | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : null;
  }
  return /^(0|[1-9][0-9]*)$/.test(value) ? BigInt(value) : null;
}

function isOne(value: MinorValue): boolean {
  return typeof value === "number"
    ? value === 1
    : /^1(?:\.0+)?$/.test(value);
}

function fxAccountKind(account: FxRunAuditAccount): "gain" | "loss" | null {
  const name = account.name.trim().toLowerCase();
  if (account.code === "7720" || name === "unrealised fx gains") return "gain";
  if (account.code === "7730" || name === "unrealised fx losses") return "loss";
  return null;
}

function linesByJournal(rows: readonly FxRunAuditLine[]): Map<string, FxRunAuditLine[]> {
  const map = new Map<string, FxRunAuditLine[]>();
  for (const line of rows) {
    const group = map.get(line.journal_id) ?? [];
    group.push(line);
    map.set(line.journal_id, group);
  }
  return map;
}

/** Compare net account effects so a reversal can contain more than one line per account. */
function matchesReversal(original: readonly FxRunAuditLine[], reverse: readonly FxRunAuditLine[]) {
  const effects = new Map<string, bigint>();
  for (const line of original) {
    const debit = units(line.debit_minor);
    const credit = units(line.credit_minor);
    if (debit === null || credit === null) return false;
    effects.set(line.account_id, (effects.get(line.account_id) ?? 0n) + debit - credit);
  }
  for (const line of reverse) {
    const debit = units(line.debit_minor);
    const credit = units(line.credit_minor);
    if (debit === null || credit === null) return false;
    effects.set(line.account_id, (effects.get(line.account_id) ?? 0n) + debit - credit);
  }
  return reverse.length > 0 && [...effects.values()].every((effect) => effect === 0n);
}

export function auditFxRevaluationRun(
  run: FxRunAuditSource,
  baseCurrency: string,
  journals: readonly FxRunAuditJournal[],
  tags: readonly FxRunAuditTag[],
  reversals: readonly FxRunAuditReversal[],
  lines: readonly FxRunAuditLine[],
  accounts: readonly FxRunAuditAccount[],
): FxRunAuditReport {
  const differences: string[] = [];
  const expectedGain = units(run.total_gain_minor);
  const expectedLoss = units(run.total_loss_minor);
  if (expectedGain === null || expectedLoss === null) {
    differences.push(
      "Stored revaluation gain or loss is not an exact nonnegative minor-unit amount.",
    );
  }
  if (!run.journal_ids.length) {
    differences.push("A posted revaluation run has no linked journals.");
  }
  if (new Set(run.journal_ids).size !== run.journal_ids.length) {
    differences.push("The same journal appears multiple times in this revaluation run.");
  }

  const journalById = new Map(journals.map((journal) => [journal.id, journal]));
  const tagById = new Map(tags.map((tag) => [tag.journal_id, tag]));
  const reversalById = new Map(reversals.map((reversal) => [reversal.journal_id, reversal]));
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const journalLines = linesByJournal(lines);
  let gain = 0n;
  let loss = 0n;
  let totalsValid = true;
  const reviewedCurrencies = new Set<string>();

  const items = run.journal_ids.map((id): FxRunAuditItem => {
    const issues: string[] = [];
    const journal = journalById.get(id);
    const tag = tagById.get(id);
    const queue = reversalById.get(id);
    const currency = tag?.currency_code.trim().toUpperCase() ?? null;
    let rowGain = 0n;
    let rowLoss = 0n;
    let rowValid = true;

    if (!journal) {
      issues.push("The revaluation journal is missing or cannot be accessed.");
      rowValid = false;
    } else {
      if (journal.status !== "posted") {
        issues.push("Revaluation journal is not posted.");
        rowValid = false;
      }
      if (journal.source_type !== "fx_revaluation" || journal.source_id !== run.id) {
        issues.push("Journal source does not identify this revaluation run.");
        rowValid = false;
      }
      if (journal.journal_date !== run.as_of_date) {
        issues.push("Journal posting date differs from the revaluation date.");
        rowValid = false;
      }
      if (journal.currency_code.trim().toUpperCase() !== baseCurrency.toUpperCase()) {
        issues.push("Journal is not denominated in the organisation base currency.");
        rowValid = false;
      }
      if (!isOne(journal.fx_rate_to_base)) {
        issues.push("Base-currency journal FX rate is not one.");
        rowValid = false;
      }
    }

    if (!tag || tag.kind !== "revaluation" || currency === null || !/^[A-Z]{3}$/.test(currency)) {
      issues.push("Revaluation currency tag is missing or invalid.");
      rowValid = false;
    } else {
      if (currency === baseCurrency.trim().toUpperCase()) {
        issues.push("Revaluation currency must differ from the organisation base currency.");
        rowValid = false;
      }
      if (reviewedCurrencies.has(currency)) {
        issues.push("Multiple journals represent the same foreign currency in this run.");
        rowValid = false;
      }
      reviewedCurrencies.add(currency);
      if (journal?.idempotency_key !== `fx_reval:${run.id}:${currency}`) {
        issues.push("Journal idempotency key does not match its run and currency.");
        rowValid = false;
      }
    }

    const postedLines = journalLines.get(id) ?? [];
    if (postedLines.length < 2) {
      issues.push("The revaluation journal has fewer than two ledger lines.");
      rowValid = false;
    }
    let debitTotal = 0n;
    let creditTotal = 0n;
    for (const line of postedLines) {
      const debit = units(line.debit_minor);
      const credit = units(line.credit_minor);
      if (debit === null || credit === null) {
        issues.push("A journal line contains unsafe or invalid minor units.");
        rowValid = false;
        continue;
      }
      debitTotal += debit;
      creditTotal += credit;
      const account = accountById.get(line.account_id);
      if (!account) {
        issues.push("A journal account is missing or cannot be accessed.");
        rowValid = false;
        continue;
      }
      const kind = fxAccountKind(account);
      if (kind === "gain") {
        if (account.account_type !== "income" || debit !== 0n || credit === 0n) {
          issues.push("Unrealised gain was posted to an incorrect account or debit side.");
          rowValid = false;
        } else {
          rowGain += credit - debit;
        }
      } else if (kind === "loss") {
        if (account.account_type !== "expense" || credit !== 0n || debit === 0n) {
          issues.push("Unrealised loss was posted to an incorrect account or credit side.");
          rowValid = false;
        } else {
          rowLoss += debit - credit;
        }
      } else if (account.account_type === "income" || account.account_type === "expense") {
        issues.push("Unexpected profit-and-loss account in the revaluation journal.");
        rowValid = false;
      } else if (account.account_type !== "asset" && account.account_type !== "liability") {
        issues.push("Revaluation adjustment must affect an asset or liability account.");
        rowValid = false;
      }
    }
    if (rowValid && debitTotal !== creditTotal) {
      issues.push("Posted revaluation journal debits and credits do not balance.");
      rowValid = false;
    }
    if (rowGain > 0n && rowLoss > 0n) {
      issues.push("A currency journal contains both unrealised gains and losses.");
      rowValid = false;
    }
    if (rowValid) {
      gain += rowGain;
      loss += rowLoss;
    } else {
      totalsValid = false;
    }

    if (!queue) {
      issues.push("Scheduled automatic reversal is missing.");
    } else {
      if (queue.origin !== "fx_revaluation" || queue.reverse_on !== run.reverse_on) {
        issues.push("Automatic reversal origin or date does not match the revaluation run.");
      }
      if (queue.status === "failed" || queue.status === "cancelled") {
        issues.push("Scheduled reversal failed or was cancelled; accountant review is required.");
      }
      if (queue.status === "done") {
        if (
          !queue.reversal_journal_id ||
          !journal ||
          journal.reversed_by_journal_id !== queue.reversal_journal_id
        ) {
          issues.push("Completed reversal does not match the original journal reference.");
        } else {
          const reversing = journalById.get(queue.reversal_journal_id);
          if (
            !reversing ||
            reversing.status !== "posted" ||
            reversing.reverses_journal_id !== id
          ) {
            issues.push("Reversal journal is missing, unposted or references another journal.");
          } else if (!matchesReversal(postedLines, journalLines.get(reversing.id) ?? [])) {
            issues.push("Reversal does not cancel the original journal amounts by account.");
          }
        }
      } else if (queue.reversal_journal_id || journal?.reversed_by_journal_id) {
        issues.push("Reversal references exist but the queue is not marked complete.");
      }
    }

    return {
      journalId: id,
      currencyCode: currency,
      status: issues.length ? "exception" : queue?.status === "done" ? "reversed" : "matched",
      reversalStatus: queue?.status ?? null,
      gainMinor: rowValid ? rowGain.toString() : null,
      lossMinor: rowValid ? rowLoss.toString() : null,
      issues,
    };
  });

  if (totalsValid && expectedGain !== null && gain !== expectedGain) {
    differences.push("Journal unrealised gains differ from the stored run gain total.");
  }
  if (totalsValid && expectedLoss !== null && loss !== expectedLoss) {
    differences.push("Journal unrealised losses differ from the stored run loss total.");
  }
  if (!totalsValid) {
    differences.push("Incomplete journal evidence prevents a reliable gain/loss total.");
  }
  return {
    runId: run.id,
    asOfDate: run.as_of_date,
    reverseOn: run.reverse_on,
    journalCount: run.journal_ids.length,
    expectedGainMinor: expectedGain?.toString() ?? null,
    actualGainMinor: totalsValid ? gain.toString() : null,
    expectedLossMinor: expectedLoss?.toString() ?? null,
    actualLossMinor: totalsValid ? loss.toString() : null,
    differences,
    exceptionCount: differences.length + items.filter((item) => item.status === "exception").length,
    reversedCount: items.filter((item) => item.status === "reversed").length,
    items,
  };
}
