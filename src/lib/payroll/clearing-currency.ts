/** Prevent payroll from posting FX=1 settlements to a bank/GL account in a
 * different currency. The database trigger is the authoritative final guard.
 */
export function payrollClearingCurrencyMismatch(
  paymentCurrency: string,
  glCurrency: string | null | undefined,
  bankCurrencies: readonly (string | null | undefined)[] = [],
): string | null {
  const currency = paymentCurrency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return "Select a valid payroll payment currency.";
  const accountCode = glCurrency?.trim().toUpperCase();
  if (accountCode && accountCode !== currency) {
    return "The clearing account currency differs from the payroll payment currency.";
  }
  for (const bankCurrency of bankCurrencies) {
    if (bankCurrency?.trim().toUpperCase() !== currency) {
      return "A linked bank account uses a different currency from this payroll payment.";
    }
  }
  return null;
}
