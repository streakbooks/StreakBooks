/**
 * Direct expense void dating (parity with bill/credit/payment void rules).
 * purchase_expenses has no void_date column yet — date still validated for the reversing journal.
 */

import { assertPurchaseDocVoidDate } from "@/lib/purchases/bill-void";

export function assertExpenseVoidDate(input: {
  expenseDate: string;
  voidDate: string;
  today: string;
}): string {
  return assertPurchaseDocVoidDate({
    documentDate: input.expenseDate,
    documentLabel: "expense",
    voidDate: input.voidDate,
    today: input.today,
  });
}
