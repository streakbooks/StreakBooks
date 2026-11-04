import type { CashPnlEntry } from "./cash-profit-loss";
import type { AccountMeta } from "@/lib/accounting/ledger-data";
import { shouldIncludeLedgerAccount, type LedgerAccountScope } from "./account-scope";

/** Financial cash-ledger rows are generated from recognised cash settlements,
 * not copied from accrual journals. Never mutate the source entries or sum a
 * filtered subset into a company-wide financial statement.
 */
type Account = Pick<AccountMeta, "id" | "code" | "name" | "account_type">;
const minor = (value: bigint) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n))
    throw new Error("Cash report amount exceeds the safe numeric range");
  return n;
};
export function buildCashGeneralLedger(input: {
  accounts: readonly Account[];
  entries: readonly CashPnlEntry[];
  from: string;
  to: string;
  selectedIds?: readonly string[];
  accountScope: LedgerAccountScope;
}) {
  if (input.from > input.to) throw new Error("End date must follow start date");
  const byId = new Map(input.accounts.map((a) => [a.id, a]));
  const selected = input.selectedIds?.length ? new Set(input.selectedIds) : null;
  if (selected && [...selected].some((id) => !byId.has(id)))
    throw new Error("Report account not found in this organisation");
  const opening = new Map<string, bigint>();
  const period = new Map<string, CashPnlEntry[]>();
  for (const entry of input.entries) {
    if (!byId.has(entry.accountId)) throw new Error("Cash entry has an unknown account");
    if (entry.debit < 0n || entry.credit < 0n)
      throw new Error("Cash ledger contains a negative debit or credit");
    if (selected && !selected.has(entry.accountId)) continue;
    if (entry.date > input.to) continue;
    if (entry.date < input.from) {
      opening.set(
        entry.accountId,
        (opening.get(entry.accountId) ?? 0n) + entry.debit - entry.credit,
      );
    } else {
      const entries = period.get(entry.accountId) ?? [];
      entries.push(entry);
      period.set(entry.accountId, entries);
    }
  }
  const ids =
    input.accountScope === "all"
      ? selected
        ? [...selected]
        : input.accounts.map((a) => a.id)
      : [...new Set([...opening.keys(), ...period.keys()])];
  const accounts = ids
    .map((id) => byId.get(id))
    .filter((a): a is Account => Boolean(a))
    .filter((a) =>
      shouldIncludeLedgerAccount(
        input.accountScope,
        period.get(a.id)?.length ?? 0,
        opening.get(a.id) ?? 0n,
      ),
    )
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
    .map((account) => {
      const sign =
        account.account_type === "asset" || account.account_type === "expense" ? 1n : -1n;
      const start = opening.get(account.id) ?? 0n;
      let running = start;
      const entries = [...(period.get(account.id) ?? [])].sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          a.journalNumber.localeCompare(b.journalNumber, undefined, { numeric: true }) ||
          a.journalId.localeCompare(b.journalId),
      );
      const rows = entries.map((entry) => {
        running += entry.debit - entry.credit;
        return {
          journal_id: entry.journalId,
          journal_number: entry.journalNumber,
          journal_date: entry.date,
          memo:
            entry.reason === "settlement" ? "Cash settlement recognition" : "Direct cash movement",
          source_type: entry.sourceType,
          source_id: entry.sourceId,
          debit_minor: minor(entry.debit),
          credit_minor: minor(entry.credit),
          running_balance_minor: minor(running * sign),
        };
      });
      return {
        account,
        opening_balance_minor: minor(start * sign),
        closing_balance_minor: minor(running * sign),
        rows,
      };
    });
  return { accounts, lineCount: accounts.reduce((sum, a) => sum + a.rows.length, 0) };
}
