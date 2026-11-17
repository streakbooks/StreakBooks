/**
 * Purchase document void dating rules (original LinkBooks).
 * A recorded void_date is required for honest historical AP as-at (bills and supplier credits).
 */

export function assertPurchaseDocVoidDate(input: {
  documentDate: string;
  documentLabel: string;
  voidDate: string;
  today: string;
}): string {
  const voidDate = String(input.voidDate ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(voidDate)) {
    throw new Error("Void date must be YYYY-MM-DD");
  }
  if (voidDate < input.documentDate) {
    throw new Error(`Void date cannot be before the ${input.documentLabel} date`);
  }
  if (voidDate > input.today) {
    throw new Error("Void date cannot be in the future");
  }
  return voidDate;
}

export function assertBillVoidDate(input: {
  billDate: string;
  voidDate: string;
  today: string;
}): string {
  return assertPurchaseDocVoidDate({
    documentDate: input.billDate,
    documentLabel: "bill",
    voidDate: input.voidDate,
    today: input.today,
  });
}

export function assertCreditNoteVoidDate(input: {
  creditDate: string;
  voidDate: string;
  today: string;
}): string {
  return assertPurchaseDocVoidDate({
    documentDate: input.creditDate,
    documentLabel: "credit note",
    voidDate: input.voidDate,
    today: input.today,
  });
}
