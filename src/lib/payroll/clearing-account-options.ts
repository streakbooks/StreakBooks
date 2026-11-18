/** Payroll clearing account picker: filter both ledger and linked bank
 * currencies before displaying options. SQL triggers remain authoritative.
 */
import { isBankOrCashAccount, type AccountCandidate } from "@/lib/purchases/bank-account-rules";
import { payrollClearingCurrencyMismatch } from "@/lib/payroll/clearing-currency";

export type PayrollClearingCandidate = AccountCandidate & {
  code: string;
  name: string;
  currency_code: string | null;
};

export type PayrollLinkedBank = {
  gl_account_id: string;
  currency_code: string | null;
  is_active: boolean;
};

export function filterPayrollClearingAccounts(
  candidates: readonly PayrollClearingCandidate[],
  linkedBanks: readonly PayrollLinkedBank[],
  payrollCurrency: string,
): {
  accounts: Array<{ id: string; code: string; name: string; currency_code: string | null }>;
  excluded: number;
} {
  const active = linkedBanks.filter((bank) => bank.is_active);
  const bankGlIds = new Set(active.map((bank) => bank.gl_account_id));
  const bankCurrencies = new Map<string, Array<string | null>>();
  for (const bank of active) {
    const currencies = bankCurrencies.get(bank.gl_account_id) ?? [];
    currencies.push(bank.currency_code);
    bankCurrencies.set(bank.gl_account_id, currencies);
  }

  const bankOrCashAccounts = candidates.filter((account) =>
    isBankOrCashAccount(account, bankGlIds),
  );
  const accounts = bankOrCashAccounts
    .filter(
      (account) =>
        !payrollClearingCurrencyMismatch(
          payrollCurrency,
          account.currency_code,
          bankCurrencies.get(account.id) ?? [],
        ),
    )
    .map(({ id, code, name, currency_code }) => ({ id, code, name, currency_code }));

  return { accounts, excluded: bankOrCashAccounts.length - accounts.length };
}
