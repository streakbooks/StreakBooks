import type { ChartAccount } from "./chart.functions";
import { sortRows, type SortState } from "@/lib/sort";

export type ChartSortKey = "code" | "name" | "type" | "balance" | "activity";
export type ChartSort = SortState<ChartSortKey>;
export type ChartViewRow = { account: ChartAccount; depth: number };

/** Display balances with their normal debit/credit sign, not raw debit-minus-credit. */
export function accountSignedMinor(
  account: ChartAccount,
  period: "balance" | "ytd" = "balance",
): number {
  const debit = period === "balance" ? account.debitMinor : account.ytdDebitMinor;
  const credit = period === "balance" ? account.creditMinor : account.ytdCreditMinor;
  return account.normalBalance === "debit" ? debit - credit : credit - debit;
}

export function canSelectForArchive(account: ChartAccount): boolean {
  return account.isActive && !account.isSystem && !account.isControl && !account.isLocked;
}

export function chartViewRows(
  accounts: readonly ChartAccount[],
  collapsed: ReadonlySet<string>,
  mode: "tree" | "flat",
  sort: ChartSort,
  showYtd: boolean,
): ChartViewRow[] {
  const ordered = sortRows(
    [...accounts],
    (account) => {
      switch (sort.key) {
        case "name":
          return account.name;
        case "type":
          return account.accountKind ?? account.accountType;
        case "balance":
          return accountSignedMinor(account);
        case "activity":
          return showYtd ? accountSignedMinor(account, "ytd") : account.transactionCount;
        default:
          return account.code;
      }
    },
    sort.dir,
  );

  if (mode === "flat") return ordered.map((account) => ({ account, depth: 0 }));

  // Sort siblings, never separate children from their parent when a non-code sort is applied.
  const children = new Map<string, ChartAccount[]>();
  for (const account of ordered) {
    const parent = account.parentId ?? "";
    const group = children.get(parent) ?? [];
    group.push(account);
    children.set(parent, group);
  }

  const rows: ChartViewRow[] = [];
  const seen = new Set<string>();
  const visit = (account: ChartAccount, depth: number) => {
    if (seen.has(account.id)) return; // Guard cyclic or malformed parent references.
    seen.add(account.id);
    rows.push({ account, depth });
    if (!collapsed.has(account.id)) {
      for (const child of children.get(account.id) ?? []) visit(child, depth + 1);
    }
  };
  for (const root of children.get("") ?? []) visit(root, 0);
  // Filtering may remove a parent. Recover genuine orphans and cycles but do not
  // reveal descendants intentionally hidden behind a collapsed ancestor.
  const byId = new Map(ordered.map((account) => [account.id, account]));
  const hiddenByCollapse = (account: ChartAccount) => {
    let parentId = account.parentId;
    const visited = new Set([account.id]);
    while (parentId && !visited.has(parentId)) {
      if (byId.has(parentId) && collapsed.has(parentId)) return true;
      visited.add(parentId);
      parentId = byId.get(parentId)?.parentId ?? null;
    }
    return false;
  };
  for (const account of ordered) {
    if (!seen.has(account.id) && !hiddenByCollapse(account)) visit(account, 0);
  }
  return rows;
}
