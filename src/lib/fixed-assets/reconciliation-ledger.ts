import {
  aggregateLines,
  loadPostedLines,
  type RpcClient,
  type Sb,
} from "@/lib/accounting/ledger-data";
import { isMissingRpc } from "@/lib/accounting/fetch-all";
import type { ReconciliationLedgerBalance } from "./reconciliation";

/** Keep numeric RPC results exact: JSON number values above MAX_SAFE_INTEGER are unusable. */
export function exactLedgerRpcAmount(value: unknown, label: string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new Error(label + " exceeds JavaScript's safe integer range.");
    }
    return BigInt(value);
  }
  if (typeof value === "string" && /^-?\d+$/.test(value)) return BigInt(value);
  throw new Error(label + " is not an exact whole minor-unit value.");
}

type RpcLedgerRow = {
  account_id: string;
  debit_minor: number | string;
  credit_minor: number | string;
};

/** Scoped, fail-closed conversion of SQL aggregate results to exact integer strings. */
export function selectExactLedgerBalances(
  rpcRows: unknown,
  accountIds: ReadonlySet<string>,
): ReconciliationLedgerBalance[] {
  if (!Array.isArray(rpcRows)) throw new Error("Invalid posted-ledger balance response.");
  const seen = new Set<string>();
  const selected: ReconciliationLedgerBalance[] = [];
  for (const input of rpcRows as RpcLedgerRow[]) {
    if (!input || typeof input.account_id !== "string" || !accountIds.has(input.account_id))
      continue;
    if (seen.has(input.account_id)) throw new Error("Duplicate ledger account aggregate.");
    seen.add(input.account_id);
    const debit = exactLedgerRpcAmount(input.debit_minor, "Ledger debit");
    const credit = exactLedgerRpcAmount(input.credit_minor, "Ledger credit");
    if (debit < 0n || credit < 0n) {
      throw new Error("Ledger debits and credits cannot be negative.");
    }
    selected.push({
      account_id: input.account_id,
      debit_minor: debit.toString(),
      credit_minor: credit.toString(),
    });
  }
  return selected;
}

/**
 * Use the shared posted GL aggregate RPC and its original args but validate raw
 * JSON amounts before any number -> bigint coercion. Missing RPC falls back to
 * paged, posted-only FX-normalised ledger lines for the referenced accounts.
 */
export async function loadExactReconciliationLedgerBalances(
  sb: Sb,
  companyId: string,
  baseCurrency: string,
  asOf: string,
  accountIds: readonly string[],
): Promise<ReconciliationLedgerBalance[]> {
  if (accountIds.length === 0) return [];
  const selected = new Set(accountIds);
  const { data, error } = await (sb as unknown as RpcClient).rpc("ledger_balances", {
    _company_id: companyId,
    _from: null,
    _to: asOf,
    _exclude_year_end_close: false,
  });
  if (!error) return selectExactLedgerBalances(data ?? [], selected);
  if (!isMissingRpc(error)) throw new Error(error.message);

  const posted = await loadPostedLines(sb, companyId, baseCurrency, {
    to: asOf,
    accountIds: [...selected],
  });
  return aggregateLines(posted).map((row) => ({
    account_id: row.account_id,
    debit_minor: row.debit_minor.toString(),
    credit_minor: row.credit_minor.toString(),
  }));
}
