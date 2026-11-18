import type { JournalBrowseSearch } from "@/lib/accounting/journal-browsing";

export const ACCOUNTING_TABS = [
  "coa",
  "industry",
  "journals",
  "post",
  "periods",
  "close",
  "health",
  "exceptions",
  "conversion",
  "fx",
  "corrections",
  "deferrals",
  "cash-classification",
] as const;
export type AccountingTab = (typeof ACCOUNTING_TABS)[number];
export type AccountingSearch = JournalBrowseSearch & {
  cashReview?: string | undefined;
  tab?: AccountingTab | undefined;
  journal?: string | undefined;
  period?: string | undefined;
};
export type Search = {
  bankAccountId?: string;
  amount?: string;
  direction?: "in" | "out";
  /** Statement line to auto-match after posting a transfer created from the match panel. */
  bankTransactionId?: string;
};
