/**
 * Purchase bill void dating rules (original LinkBooks).
 * A recorded void_date is required for honest historical Aged Payables as-at.
 */

export function assertBillVoidDate(input: {
  billDate: string;
  voidDate: string;
  today: string;
}): string {
  const voidDate = String(input.voidDate ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(voidDate)) {
    throw new Error("Void date must be YYYY-MM-DD");
  }
  if (voidDate < input.billDate) {
    throw new Error("Void date cannot be before the bill date");
  }
  if (voidDate > input.today) {
    throw new Error("Void date cannot be in the future");
  }
  return voidDate;
}
