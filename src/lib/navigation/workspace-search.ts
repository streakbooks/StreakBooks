export const ACCOUNTING_TABS = [
  "coa",
  "industry",
  "journals",
  "post",
  "periods",
  "close",
  "health",
  "conversion",
  "fx",
  "corrections",
  "deferrals",
] as const;
export type AccountingTab = (typeof ACCOUNTING_TABS)[number];
export type AccountingSearch = {
  tab?: AccountingTab | undefined;
  journal?: string | undefined;
  period?: string | undefined;
};
export type Search = { bankAccountId?: string; amount?: string; direction?: "in" | "out" };
