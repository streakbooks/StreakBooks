/**
 * Fixed Assets posting evidence contracts — Accounting reconciliation Batch 1.
 *
 * Mirrors the source journal metadata and line allocation produced by
 * supabase/migrations/20261025400300_fixed_assets.sql. These pure functions are
 * not endpoints and do not query, post, reverse or approve accounting records.
 *
 * A passing depreciation result is only proof of source-to-journal-line parity
 * for the supplied run. A disposal is always "partial" when its identifiable
 * cost/accumulated lines pass: the asset row does not persist proceeds and
 * gain/loss account IDs, so their *classification* cannot be verified here.
 */
export type AssetPostingMinor = bigint | number | string;

export type AssetPostingJournal = {
  id: string;
  company_id: string;
  journal_date: string;
  currency_code: string | null;
  status: string;
  source_type: string;
  source_id: string | null;
  idempotency_key: string | null;
  reversed_by_journal_id: string | null;
};

export type AssetPostingLine = {
  id: string;
  company_id: string;
  journal_id: string;
  line_no: number;
  account_id: string;
  debit_minor: AssetPostingMinor;
  credit_minor: AssetPostingMinor;
};

export type AssetDepreciationRunEvidence = {
  id: string;
  company_id: string;
  period_end: string;
  journal_id: string | null;
  total_minor: AssetPostingMinor;
  asset_count: number;
};
export type AssetDepreciationEntryEvidence = {
  id: string;
  company_id: string;
  asset_id: string;
  run_id: string;
  period_end: string;
  journal_id: string;
  amount_minor: AssetPostingMinor;
};
export type AssetPostingAsset = {
  id: string;
  company_id: string;
  cost_minor: AssetPostingMinor;
  opening_accumulated_minor: AssetPostingMinor;
  asset_account_id: string;
  accumulated_account_id: string;
  expense_account_id: string;
  status: "active" | "disposed";
  purchase_date: string;
  disposal_date: string | null;
  disposal_proceeds_minor: AssetPostingMinor | null;
  disposal_journal_id: string | null;
};
export type AssetPostingAccountSide = {
  accountId: string;
  side: "debit" | "credit";
  expectedMinor: string;
  postedMinor: string;
  matched: boolean;
};
export type AssetDepreciationPostingReview = {
  status: "matched" | "exceptions";
  runId: string;
  journalId: string;
  currency: string;
  entryCount: number;
  glLineCount: number;
  expectedTotalMinor: string;
  registeredTotalMinor: string | null;
  postedDebitMinor: string;
  postedCreditMinor: string;
  accountSides: AssetPostingAccountSide[];
  issues: string[];
};
export type AssetDisposalPostingReview = {
  status: "partial" | "exceptions";
  assetId: string;
  journalId: string;
  currency: string;
  depreciationEntryCount: number;
  accumulatedMinor: string | null;
  costMinor: string | null;
  netBookValueMinor: string | null;
  proceedsMinor: string | null;
  gainLossMinor: string | null;
  postedDebitMinor: string;
  postedCreditMinor: string;
  issues: string[];
  warnings: string[];
};

function exactMinor(value: AssetPostingMinor, label: string): bigint {
  if (typeof value === "bigint" && value >= 0n) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return BigInt(value);
  }
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  throw new Error(label + " is not a safe non-negative exact minor-unit value.");
}
function validDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const date = new Date(day + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day;
}
function monthEnd(day: string): boolean {
  if (!validDay(day)) return false;
  const value = new Date(day + "T00:00:00Z");
  value.setUTCDate(value.getUTCDate() + 1);
  return value.getUTCDate() === 1;
}
function put(
  map: Map<string, bigint>,
  accountId: string,
  side: "debit" | "credit",
  value: bigint,
): void {
  if (value <= 0n || !accountId) return;
  const id = accountId + "|" + side;
  map.set(id, (map.get(id) ?? 0n) + value);
}
function journalLines(
  companyId: string,
  journalId: string,
  lines: readonly AssetPostingLine[],
  issues: string[],
): { sides: Map<string, bigint>; debit: bigint; credit: bigint } {
  const sides = new Map<string, bigint>();
  const ids = new Set<string>();
  const numbers = new Set<number>();
  let debit = 0n;
  let credit = 0n;
  for (const [index, line] of lines.entries()) {
    const label = "GL line " + (index + 1);
    if (!line.id || ids.has(line.id)) issues.push(label + " has missing or duplicate identity.");
    ids.add(line.id);
    if (!Number.isSafeInteger(line.line_no) || line.line_no < 1 || numbers.has(line.line_no)) {
      issues.push(label + " has missing or duplicate line number.");
    }
    numbers.add(line.line_no);
    if (line.company_id !== companyId || line.journal_id !== journalId) {
      issues.push(label + " belongs to another organisation or journal.");
    }
    if (!line.account_id) issues.push(label + " has no GL account.");
    try {
      const d = exactMinor(line.debit_minor, label + " debit");
      const c = exactMinor(line.credit_minor, label + " credit");
      if ((d === 0n && c === 0n) || (d > 0n && c > 0n)) {
        issues.push(label + " must contain exactly one nonzero debit or credit side.");
      }
      debit += d;
      credit += c;
      put(sides, line.account_id, "debit", d);
      put(sides, line.account_id, "credit", c);
    } catch (error) {
      issues.push(error instanceof Error ? error.message : label + " has invalid GL amounts.");
    }
  }
  if (lines.length < 2 || debit === 0n || credit === 0n || debit !== credit) {
    issues.push("Posted asset journal GL lines are missing, empty or unbalanced.");
  }
  return { sides, debit, credit };
}
function metadata(
  companyId: string,
  currency: string,
  journal: AssetPostingJournal,
  expectedSource: string,
  expectedId: string,
  expectedKey: string,
  expectedDate: string,
  issues: string[],
): void {
  if (journal.company_id !== companyId || !journal.id)
    issues.push("GL journal identity or organisation is invalid.");
  if (journal.status !== "posted" || journal.reversed_by_journal_id) {
    issues.push("Linked asset journal is missing an active posted status.");
  }
  if (journal.source_type !== expectedSource || journal.source_id !== expectedId) {
    issues.push("Asset journal source type or source ID differs from posting source.");
  }
  if (journal.idempotency_key !== expectedKey)
    issues.push("Asset journal posting key is incorrect.");
  if (journal.journal_date !== expectedDate || !validDay(journal.journal_date)) {
    issues.push("Asset journal date differs from source posting date.");
  }
  if (!/^[A-Z]{3}$/.test(currency) || journal.currency_code !== currency) {
    issues.push("Asset journal is not in the expected organisation base currency.");
  }
}

/**
 * Verify one monthly depreciation run against its entry rows and posted journal.
 * SQL writes one line pair per positive asset entry; comparison is per-account
 * and side so shared expense/accumulated accounts do not get silently netted.
 */
export function reviewAssetDepreciationPosting(
  companyId: string,
  baseCurrency: string,
  run: AssetDepreciationRunEvidence,
  entries: readonly AssetDepreciationEntryEvidence[],
  assets: readonly AssetPostingAsset[],
  journal: AssetPostingJournal,
  lines: readonly AssetPostingLine[],
): AssetDepreciationPostingReview {
  const issues: string[] = [];
  if (!run.id || run.company_id !== companyId || run.journal_id !== journal.id) {
    issues.push("Depreciation run does not link to the selected organisation and journal.");
  }
  if (!monthEnd(run.period_end)) issues.push("Depreciation run period is not a valid month end.");
  if (!Number.isSafeInteger(run.asset_count) || run.asset_count < 1) {
    issues.push("Posted depreciation run has an invalid asset count.");
  }
  metadata(
    companyId,
    baseCurrency,
    journal,
    "depreciation",
    run.id,
    "fa-dep-run:" + run.id,
    run.period_end,
    issues,
  );

  const byAsset = new Map<string, AssetPostingAsset>();
  for (const asset of assets) {
    if (!asset.id || byAsset.has(asset.id) || asset.company_id !== companyId) {
      issues.push("Depreciation asset evidence is duplicated or belongs to another organisation.");
    }
    byAsset.set(asset.id, asset);
  }
  const seenEntries = new Set<string>();
  const seenAssets = new Set<string>();
  const expected = new Map<string, bigint>();
  let expectedTotal = 0n;
  for (const [index, entry] of entries.entries()) {
    const label = "Depreciation entry " + (index + 1);
    if (
      !entry.id ||
      seenEntries.has(entry.id) ||
      seenAssets.has(entry.asset_id) ||
      entry.company_id !== companyId ||
      entry.run_id !== run.id ||
      entry.journal_id !== journal.id ||
      entry.period_end !== run.period_end
    ) {
      issues.push(label + " is duplicated or not linked to the requested run and period.");
    }
    seenEntries.add(entry.id);
    seenAssets.add(entry.asset_id);
    const asset = byAsset.get(entry.asset_id);
    if (!asset) issues.push(label + " has a missing company-owned fixed asset.");
    try {
      const amount = exactMinor(entry.amount_minor, label);
      if (amount === 0n) issues.push(label + " is zero; SQL only records positive depreciation.");
      expectedTotal += amount;
      if (asset) {
        if (!asset.expense_account_id || !asset.accumulated_account_id) {
          issues.push(label + " has missing asset posting-account mappings.");
        }
        try {
          const cost = exactMinor(asset.cost_minor, label + " asset cost");
          const opening = exactMinor(
            asset.opening_accumulated_minor,
            label + " opening depreciation",
          );
          if (cost === 0n || cost > 900000000000000n || opening > cost || amount > cost - opening) {
            issues.push(
              label + " exceeds the asset's valid cost and opening depreciation capacity.",
            );
          }
          if (
            asset.purchase_date > run.period_end ||
            !validDay(asset.purchase_date) ||
            (asset.disposal_date && asset.disposal_date.slice(0, 7) < run.period_end.slice(0, 7))
          ) {
            issues.push(label + " belongs to an asset outside its valid purchase/disposal period.");
          }
        } catch (error) {
          issues.push(error instanceof Error ? error.message : label + " asset cost invalid.");
        }
        put(expected, asset.expense_account_id, "debit", amount);
        put(expected, asset.accumulated_account_id, "credit", amount);
      }
    } catch (error) {
      issues.push(error instanceof Error ? error.message : label + " amount invalid.");
    }
  }
  if (entries.length === 0 || assets.length !== seenAssets.size) {
    issues.push("Depreciation entry/asset source evidence is missing or incomplete.");
  }
  if (entries.length !== run.asset_count)
    issues.push("Depreciation entry count differs from run asset_count.");
  let registeredTotal: bigint | null = null;
  try {
    registeredTotal = exactMinor(run.total_minor, "Depreciation run total");
    if (registeredTotal === 0n || expectedTotal !== registeredTotal) {
      issues.push("Depreciation entry amounts do not match the posted run total.");
    }
  } catch (error) {
    issues.push(error instanceof Error ? error.message : "Depreciation run total invalid.");
  }

  const posted = journalLines(companyId, journal.id, lines, issues);
  const sides: AssetPostingAccountSide[] = [
    ...new Set([...expected.keys(), ...posted.sides.keys()]),
  ]
    .sort()
    .map((key) => {
      const separator = key.lastIndexOf("|");
      const exp = expected.get(key) ?? 0n;
      const actual = posted.sides.get(key) ?? 0n;
      if (exp !== actual) issues.push("Depreciation GL difference for " + key + ".");
      return {
        accountId: key.slice(0, separator),
        side: key.slice(separator + 1) as "debit" | "credit",
        expectedMinor: exp.toString(),
        postedMinor: actual.toString(),
        matched: exp === actual,
      };
    });
  if (posted.debit !== expectedTotal || posted.credit !== expectedTotal) {
    issues.push("Posted GL depreciation total differs from source depreciation entries.");
  }
  return {
    status: issues.length ? "exceptions" : "matched",
    runId: run.id,
    journalId: journal.id,
    currency: baseCurrency,
    entryCount: entries.length,
    glLineCount: lines.length,
    expectedTotalMinor: expectedTotal.toString(),
    registeredTotalMinor: registeredTotal?.toString() ?? null,
    postedDebitMinor: posted.debit.toString(),
    postedCreditMinor: posted.credit.toString(),
    accountSides: sides,
    issues,
  };
}

/**
 * Review one asset disposal's cost removal / accumulated depreciation evidence.
 * Proceeds-account and gain/loss-account IDs are not stored on fixed_assets,
 * so no all-clear is possible for their classification from this evidence.
 */
export function reviewAssetDisposalPosting(
  companyId: string,
  baseCurrency: string,
  asset: AssetPostingAsset,
  entries: readonly AssetDepreciationEntryEvidence[],
  journal: AssetPostingJournal,
  lines: readonly AssetPostingLine[],
): AssetDisposalPostingReview {
  const issues: string[] = [];
  const warnings = [
    "Proceeds and gain/loss account classifications are not independently verifiable from the current fixed-asset register row.",
  ];
  if (
    !asset.id ||
    asset.company_id !== companyId ||
    asset.status !== "disposed" ||
    !validDay(asset.purchase_date) ||
    !validDay(asset.disposal_date ?? "") ||
    (asset.disposal_date && asset.purchase_date > asset.disposal_date) ||
    !asset.disposal_journal_id ||
    asset.disposal_journal_id !== journal.id
  ) {
    issues.push("Disposal asset status, dates or linked journal are inconsistent.");
  }
  metadata(
    companyId,
    baseCurrency,
    journal,
    "asset_disposal",
    asset.id,
    "fa-dispose:" + asset.id,
    asset.disposal_date ?? "",
    issues,
  );
  const entryIds = new Set<string>();
  const periods = new Set<string>();
  let depreciation = 0n;
  for (const [index, entry] of entries.entries()) {
    const label = "Disposal depreciation entry " + (index + 1);
    if (
      !entry.id ||
      entryIds.has(entry.id) ||
      entry.asset_id !== asset.id ||
      entry.company_id !== companyId ||
      !entry.run_id ||
      !validDay(entry.period_end) ||
      !monthEnd(entry.period_end) ||
      periods.has(entry.period_end) ||
      (asset.disposal_date && entry.period_end.slice(0, 7) > asset.disposal_date.slice(0, 7)) ||
      !entry.journal_id
    ) {
      issues.push(label + " has duplicated, inconsistent or post-disposal source evidence.");
    }
    entryIds.add(entry.id);
    periods.add(entry.period_end);
    try {
      const amount = exactMinor(entry.amount_minor, label);
      if (amount === 0n) issues.push(label + " must be positive.");
      depreciation += amount;
    } catch (error) {
      issues.push(error instanceof Error ? error.message : label + " amount invalid.");
    }
  }
  let cost: bigint | null = null,
    accumulated: bigint | null = null;
  let proceeds: bigint | null = null,
    netBook: bigint | null = null,
    gainLoss: bigint | null = null;
  try {
    cost = exactMinor(asset.cost_minor, "Disposed asset cost");
    accumulated =
      exactMinor(asset.opening_accumulated_minor, "Opening accumulated depreciation") +
      depreciation;
    if (cost === 0n || accumulated > cost) {
      issues.push("Asset cost is zero or cumulative depreciation exceeds acquisition cost.");
    }
    netBook = cost - accumulated;
    if (asset.disposal_proceeds_minor === null) {
      issues.push("Disposal proceeds amount is missing.");
    } else {
      proceeds = exactMinor(asset.disposal_proceeds_minor, "Disposal proceeds");
      gainLoss = proceeds - netBook;
    }
  } catch (error) {
    issues.push(error instanceof Error ? error.message : "Disposal amounts invalid.");
  }

  const posted = journalLines(companyId, journal.id, lines, issues);
  if (!asset.asset_account_id || !asset.accumulated_account_id) {
    issues.push("Disposed asset is missing cost or accumulated depreciation account mappings.");
  }
  if (cost !== null) {
    const assetCredit = posted.sides.get(asset.asset_account_id + "|credit") ?? 0n;
    if (assetCredit !== cost)
      issues.push("Disposal journal does not credit exact original asset cost.");
  }
  if (accumulated !== null && accumulated > 0n) {
    const accumulatedDebit = posted.sides.get(asset.accumulated_account_id + "|debit") ?? 0n;
    if (accumulatedDebit < accumulated) {
      issues.push("Disposal journal does not debit accumulated depreciation in full.");
    }
    if (accumulatedDebit > accumulated) {
      warnings.push(
        "Accumulated depreciation GL account has additional disposal debit amounts; check shared proceeds accounts.",
      );
    }
  }
  if (cost !== null && netBook !== null && proceeds !== null) {
    // The SQL disposal journal should reverse the cost and recognise total
    // proceeds + gain/loss. Without account IDs, we cannot prove allocation
    // among those accounts; an unbalanced or missing cost/accumulated line fails.
    if (posted.debit !== posted.credit) {
      issues.push("Asset disposal journal is unbalanced.");
    }
  }
  return {
    status: issues.length ? "exceptions" : "partial",
    assetId: asset.id,
    journalId: journal.id,
    currency: baseCurrency,
    depreciationEntryCount: entries.length,
    accumulatedMinor: accumulated?.toString() ?? null,
    costMinor: cost?.toString() ?? null,
    netBookValueMinor: netBook?.toString() ?? null,
    proceedsMinor: proceeds?.toString() ?? null,
    gainLossMinor: gainLoss?.toString() ?? null,
    postedDebitMinor: posted.debit.toString(),
    postedCreditMinor: posted.credit.toString(),
    issues,
    warnings,
  };
}
