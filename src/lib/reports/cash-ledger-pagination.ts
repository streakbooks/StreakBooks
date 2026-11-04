import { buildCashGeneralLedger } from "./cash-general-ledger";

export type CashLedgerGroup = "code" | "name" | "type";
export type CashLedgerResult = ReturnType<typeof buildCashGeneralLedger>;

/**
 * Deterministic, globally ordered report-row paging.
 *
 * Each account consumes one structural row, even without transactions. That
 * ensures accounts with only opening balances and zero-balance accounts remain
 * pageable. Every cash movement consumes one additional row. The full-period
 * opening/closing and each transaction's original running balance are not
 * recomputed for a page.
 */
export function paginateCashGeneralLedger(
  report: CashLedgerResult,
  options: { page: number; pageSize: 25 | 50 | 100 | 200; groupBy?: CashLedgerGroup },
) {
  const { page, pageSize, groupBy = "code" } = options;
  if (!Number.isSafeInteger(page) || page < 0) throw new Error("Invalid cash report page");
  const accounts = [...report.accounts].sort((a, b) => {
    if (groupBy === "name")
      return (
        a.account.name.localeCompare(b.account.name) || a.account.code.localeCompare(b.account.code)
      );
    if (groupBy === "type")
      return (
        a.account.account_type.localeCompare(b.account.account_type) ||
        a.account.code.localeCompare(b.account.code)
      );
    return a.account.code.localeCompare(b.account.code);
  });
  const totalCount = report.lineCount + accounts.length;
  const offset = page * pageSize;
  if (offset >= totalCount && page > 0)
    throw new Error("Report page is outside the selected results; return to the first page");
  const end = offset + pageSize;
  let cursor = 0;
  const visible: typeof accounts = [];
  for (const account of accounts) {
    const blockEnd = cursor + 1 + account.rows.length;
    if (blockEnd > offset && cursor < end) {
      const first = Math.max(0, offset - cursor - 1);
      const last = Math.max(0, end - cursor - 1);
      visible.push({
        ...account,
        rows: account.rows.slice(first, last),
      });
    }
    cursor = blockEnd;
    if (cursor >= end) break;
  }
  return {
    accounts: visible,
    lineCount: visible.reduce((sum, a) => sum + a.rows.length, 0),
    totalLineCount: report.lineCount,
    totalAccountCount: accounts.length,
    totalCount,
    page,
    pageSize,
  };
}
