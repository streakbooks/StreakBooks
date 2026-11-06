import { addDaysIso } from "@/lib/accounting/fiscal-year";
import {
  cashProfitLoss,
  type CashPnlInput,
  type CashPnlEntry,
} from "@/lib/reports/cash-profit-loss";
import { apportionCumulativeCash } from "@/lib/reports/cash-settlement";
import type { ProjectProfitRow } from "./projects";

export type ProjectSourceLine = {
  sourceType: string;
  sourceId: string;
  accountId: string;
  projectId: string | null;
  netMinor: bigint;
};
export type DirectProjectTag = { sourceId: string; projectId: string | null };

/** Distribute the existing cash recognitions, including untagged lines in the denominator.
 * Cumulative apportionment keeps pennies consistent across separate reporting periods.
 * The accounting engine remains the sole owner of payment/refund recognition and FX.
 */
export function cashProjectProfitability(
  input: CashPnlInput,
  projects: ProjectProfitRow[],
  sourceLines: ProjectSourceLine[],
  directTags: DirectProjectTag[],
  period: { from: string; to: string },
): ProjectProfitRow[] {
  const result = new Map(
    projects.map((p) => [
      p.projectId,
      {
        ...p,
        revenueMinor: 0,
        costMinor: 0,
        profitMinor: 0,
        unconvertedDocuments: 0,
      },
    ]),
  );
  const weights = new Map<string, Map<string | null, bigint>>();
  const key = (type: string, id: string, account: string) => `${type}:${id}:${account}`;
  for (const line of sourceLines) {
    if (line.netMinor < 0n) throw new Error("Project source line has a negative net amount");
    const id = key(line.sourceType, line.sourceId, line.accountId);
    const grouped = weights.get(id) ?? new Map<string | null, bigint>();
    grouped.set(line.projectId, (grouped.get(line.projectId) ?? 0n) + line.netMinor);
    weights.set(id, grouped);
  }
  const direct = new Map(directTags.map((tag) => [tag.sourceId, tag.projectId]));
  const journals = new Map(input.journals.map((journal) => [journal.id, journal]));
  const sourceIds = new Map(
    (input.documentJournalLinks ?? []).map((link) => [link.journalId, link.documentId]),
  );
  const accounts = new Map(input.accounts.map((account) => [account.id, account.account_type]));
  const prior =
    period.from === "0001-01-01"
      ? []
      : cashProfitLoss(input, {
          from: "0001-01-01",
          to: addDaysIso(period.from, -1),
        });
  const entries = cashProfitLoss(input, period);
  const cumulative = new Map<string, bigint>();
  const natural = (entry: CashPnlEntry) =>
    accounts.get(entry.accountId) === "income"
      ? entry.credit - entry.debit
      : entry.debit - entry.credit;
  const entryKey = (entry: CashPnlEntry) => `${entry.sourceJournalId}:${entry.accountId}`;
  for (const entry of prior) {
    const id = entryKey(entry);
    cumulative.set(id, (cumulative.get(id) ?? 0n) + natural(entry));
  }
  for (const entry of entries) {
    let original = journals.get(entry.sourceJournalId);
    const visited = new Set<string>();
    while (original?.reverses && !visited.has(original.id)) {
      visited.add(original.id);
      original = journals.get(original.reverses);
    }
    if (!original) continue;
    const sourceId =
      entry.reason === "settlement"
        ? entry.sourceId
        : (original.sourceId ?? sourceIds.get(original.id) ?? entry.sourceId);
    if (!sourceId) continue;
    let grouped = weights.get(
      key(
        entry.reason === "settlement" ? entry.sourceType : original.sourceType,
        sourceId,
        entry.sourceAccountId ?? entry.accountId,
      ),
    );
    if (!grouped && direct.has(sourceId)) grouped = new Map([[direct.get(sourceId) ?? null, 1n]]);
    if (!grouped || ![...grouped.keys()].some((id) => id !== null)) continue;
    const parts = [...grouped]
      .filter(([, weight]) => weight > 0n)
      .sort(([a], [b]) => (a ?? "").localeCompare(b ?? ""));
    const total = parts.reduce((sum, [, weight]) => sum + weight, 0n);
    if (total === 0n) continue;
    const distribute = (amount: bigint) =>
      apportionCumulativeCash(
        amount < 0n ? -amount : amount,
        parts.map(([, weight]) => weight),
        total,
      ).map((share) => (amount < 0n ? -share : share));
    const id = entryKey(entry);
    const before = cumulative.get(id) ?? 0n;
    const after = before + natural(entry);
    const beforeShares = distribute(before),
      afterShares = distribute(after);
    cumulative.set(id, after);
    for (const [index, [projectId]] of parts.entries()) {
      if (projectId === null) continue;
      const row = result.get(projectId);
      if (!row) throw new Error("Project cash tag does not belong to the selected company");
      const amount = Number(afterShares[index]! - beforeShares[index]!);
      if (!Number.isSafeInteger(amount))
        throw new Error("Project cash amount exceeds the supported range");
      if (accounts.get(entry.accountId) === "income") row.revenueMinor += amount;
      else row.costMinor += amount;
      row.profitMinor = row.revenueMinor - row.costMinor;
      if (![row.revenueMinor, row.costMinor, row.profitMinor].every(Number.isSafeInteger))
        throw new Error("Project cash totals exceed the supported range");
    }
  }
  return [...result.values()];
}
