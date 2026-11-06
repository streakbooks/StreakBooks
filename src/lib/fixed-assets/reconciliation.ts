/**
 * Read-only Fixed Assets / general-ledger reconciliation.
 *
 * Register costs are debits, accumulated depreciation is a credit. We reconcile
 * the SIGNED net (debits minus credits) per GL account rather than interpreting
 * every account as exclusively cost or contra; one account can appear in both
 * roles across different assets.
 *
 * This explains differences, but never posts balancing entries.
 */

export type ReconciliationAsset = {
  id: string;
  asset_account_id: string;
  accumulated_account_id: string;
  purchase_date: string;
  disposal_date: string | null;
  status: "active" | "disposed";
  cost_minor: number | string;
  opening_accumulated_minor: number | string;
};

export type ReconciliationDepreciationEntry = {
  asset_id: string;
  period_end: string;
  amount_minor: number | string;
};

export type ReconciliationAccount = {
  id: string;
  code: string;
  name: string;
};

export type ReconciliationLedgerBalance = {
  account_id: string;
  debit_minor: bigint | number | string;
  credit_minor: bigint | number | string;
};

export type ReconciliationAccountRow = {
  accountId: string;
  accountCode: string;
  accountName: string;
  linkedAssets: number;
  registerCostMinor: string;
  registerAccumulatedMinor: string;
  registerNetMinor: string;
  ledgerNetMinor: string;
  differenceMinor: string;
  status: "matched" | "variance";
};

export type ReconciliationResult = {
  asOf: string;
  rows: ReconciliationAccountRow[];
  matchedCount: number;
  varianceCount: number;
  netDifferenceMinor: string;
};

function exactMinor(value: bigint | number | string, label: string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && !Number.isSafeInteger(value)) {
    throw new Error(label + " exceeds safe integer precision");
  }
  if (typeof value === "string" && !/^-?\d+$/.test(value)) {
    throw new Error(label + " is not a whole minor-unit amount");
  }
  return BigInt(value);
}

function isHeldAt(asset: ReconciliationAsset, asOf: string): boolean {
  return (
    asset.purchase_date <= asOf &&
    !(asset.status === "disposed" && asset.disposal_date !== null && asset.disposal_date <= asOf)
  );
}

/** Exact minor-unit totals; the caller must provide complete tenant-scoped, posted-only datasets. */
export function reconcileFixedAssets(
  assets: readonly ReconciliationAsset[],
  depreciationEntries: readonly ReconciliationDepreciationEntry[],
  ledgerBalances: readonly ReconciliationLedgerBalance[],
  accounts: readonly ReconciliationAccount[],
  asOf: string,
): ReconciliationResult {
  const accountMeta = new Map(accounts.map((account) => [account.id, account]));
  type Bucket = { accountId: string; cost: bigint; accumulated: bigint; assets: Set<string> };
  const buckets = new Map<string, Bucket>();
  const bucketFor = (id: string) => {
    const account = accountMeta.get(id);
    if (!account) throw new Error("Asset references a GL account missing from this organisation");
    let bucket = buckets.get(id);
    if (!bucket) {
      bucket = { accountId: account.id, cost: 0n, accumulated: 0n, assets: new Set() };
      buckets.set(id, bucket);
    }
    return bucket;
  };

  // A disposed asset must still cause its historic accounts to be reviewed even
  // when the expected as-at book balance is zero.
  const activeById = new Map<string, ReconciliationAsset>();
  for (const asset of assets) {
    if (asset.purchase_date > asOf) continue;
    bucketFor(asset.asset_account_id);
    bucketFor(asset.accumulated_account_id);
    if (!isHeldAt(asset, asOf)) continue;
    activeById.set(asset.id, asset);
    const cost = exactMinor(asset.cost_minor, "Register cost");
    const opening = exactMinor(asset.opening_accumulated_minor, "Opening accumulated depreciation");
    if (cost <= 0n || opening < 0n || opening > cost) {
      throw new Error("Invalid fixed asset cost or opening depreciation");
    }
    const costBucket = bucketFor(asset.asset_account_id);
    costBucket.cost += cost;
    costBucket.assets.add(asset.id);
    const accumulatedBucket = bucketFor(asset.accumulated_account_id);
    accumulatedBucket.accumulated += opening;
    accumulatedBucket.assets.add(asset.id);
  }

  for (const entry of depreciationEntries) {
    if (entry.period_end > asOf) continue;
    const asset = activeById.get(entry.asset_id);
    if (!asset) continue;
    const amount = exactMinor(entry.amount_minor, "Posted depreciation");
    if (amount <= 0n) throw new Error("Posted depreciation must be positive");
    bucketFor(asset.accumulated_account_id).accumulated += amount;
  }

  const actualById = new Map<string, bigint>();
  for (const ledger of ledgerBalances) {
    if (!buckets.has(ledger.account_id)) continue;
    if (actualById.has(ledger.account_id)) {
      throw new Error("Duplicate ledger balance for one account");
    }
    const debit = exactMinor(ledger.debit_minor, "Ledger debits");
    const credit = exactMinor(ledger.credit_minor, "Ledger credits");
    if (debit < 0n || credit < 0n) throw new Error("Ledger debits and credits cannot be negative");
    actualById.set(ledger.account_id, debit - credit);
  }

  let netDifference = 0n;
  const rows: ReconciliationAccountRow[] = [...buckets.values()].map((bucket) => {
    const info = accountMeta.get(bucket.accountId)!;
    const expected = bucket.cost - bucket.accumulated;
    const actual = actualById.get(bucket.accountId) ?? 0n;
    const difference = actual - expected;
    netDifference += difference;
    return {
      accountId: bucket.accountId,
      accountCode: info.code,
      accountName: info.name,
      linkedAssets: bucket.assets.size,
      registerCostMinor: bucket.cost.toString(),
      registerAccumulatedMinor: bucket.accumulated.toString(),
      registerNetMinor: expected.toString(),
      ledgerNetMinor: actual.toString(),
      differenceMinor: difference.toString(),
      status: difference === 0n ? "matched" : "variance",
    };
  });
  rows.sort((a, b) => a.accountCode.localeCompare(b.accountCode, undefined, { numeric: true }));
  return {
    asOf,
    rows,
    matchedCount: rows.filter((row) => row.status === "matched").length,
    varianceCount: rows.filter((row) => row.status === "variance").length,
    netDifferenceMinor: netDifference.toString(),
  };
}
