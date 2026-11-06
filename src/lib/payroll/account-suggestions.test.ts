import { describe, expect, it } from "vitest";
import type { AccountType } from "@/lib/accounting/coa-library/types";
import { suggestPayrollGlAccounts } from "@/lib/payroll/account-suggestions";

const meta = (
  overrides: Partial<{
    id: string;
    name: string;
    account_type: AccountType;
    system_key: string | null;
    is_active: boolean;
    is_postable: boolean;
  }> = {},
) => ({
  id: overrides.id ?? "a1",
  name: overrides.name ?? "Account",
  account_type: overrides.account_type ?? "expense",
  system_key: overrides.system_key ?? null,
  is_active: overrides.is_active ?? true,
  is_postable: overrides.is_postable ?? true,
});

describe("suggestPayrollGlAccounts", () => {
  it("prefers exp_wages and liab_payroll system keys", () => {
    const suggestions = suggestPayrollGlAccounts([
      meta({ id: "exp", system_key: "exp_wages", account_type: "expense" }),
      meta({ id: "liab", system_key: "liab_payroll", account_type: "liability" }),
    ]);
    expect(suggestions.salaryExpenseAccountId).toBe("exp");
    expect(suggestions.netPayLiabilityAccountId).toBe("liab");
    expect(suggestions.deductionLiabilityAccountId).toBe("liab");
    expect(suggestions.employerLiabilityAccountId).toBeNull();
  });

  it("optionally suggests employer wages expense by name", () => {
    const suggestions = suggestPayrollGlAccounts([
      meta({
        id: "ee",
        name: "Employer wages tax",
        account_type: "expense",
      }),
    ]);
    expect(suggestions.employerExpenseAccountId).toBe("ee");
  });

  it("ignores inactive or non-postable accounts", () => {
    const suggestions = suggestPayrollGlAccounts([
      meta({
        id: "skip",
        system_key: "exp_wages",
        is_active: false,
      }),
    ]);
    expect(suggestions.salaryExpenseAccountId).toBeNull();
  });
});
