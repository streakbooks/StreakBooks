import type { AccountMeta } from "@/lib/accounting/ledger-data";

export type PayrollGlAccountSuggestions = {
  salaryExpenseAccountId: string | null;
  netPayLiabilityAccountId: string | null;
  deductionLiabilityAccountId: string | null;
  employerExpenseAccountId: string | null;
  employerLiabilityAccountId: string | null;
};

type SuggestableAccount = Pick<
  AccountMeta,
  "id" | "name" | "account_type" | "system_key" | "is_active" | "is_postable"
>;

function isUsable(account: SuggestableAccount): boolean {
  return account.is_active !== false && account.is_postable !== false;
}

function firstBySystemKey(accounts: SuggestableAccount[], key: string): string | null {
  const normalized = key.toLowerCase();
  const match = accounts.find(
    (a) => isUsable(a) && (a.system_key ?? "").toLowerCase() === normalized,
  );
  return match?.id ?? null;
}

function findEmployerWagesExpense(accounts: SuggestableAccount[]): string | null {
  const expenses = accounts.filter((a) => a.account_type === "expense" && isUsable(a));
  const match = expenses.find((a) => /\bemployer\b/i.test(a.name) && /\bwages?\b/i.test(a.name));
  return match?.id ?? null;
}

/** Chart-based GL hints for empty payroll settings fields (never overrides saved values). */
export function suggestPayrollGlAccounts(
  accounts: SuggestableAccount[],
): PayrollGlAccountSuggestions {
  const salaryExpenseAccountId = firstBySystemKey(accounts, "exp_wages");
  const payrollLiabilityId = firstBySystemKey(accounts, "liab_payroll");

  return {
    salaryExpenseAccountId,
    netPayLiabilityAccountId: payrollLiabilityId,
    deductionLiabilityAccountId: payrollLiabilityId,
    employerExpenseAccountId: findEmployerWagesExpense(accounts),
    employerLiabilityAccountId: null,
  };
}
