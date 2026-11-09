/** Format CRM money stored in minor units without claiming GL base-currency conversion. */
export function formatCrmMinor(amountMinor: number, currencyCode: string): string {
  const major = amountMinor / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode || "USD",
      maximumFractionDigits: 2,
    }).format(major);
  } catch {
    return `${major.toFixed(2)} ${currencyCode || "USD"}`;
  }
}
