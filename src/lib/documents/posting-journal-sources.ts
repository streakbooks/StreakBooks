import type { AttachmentEntityType } from "@/lib/documents/attachments";

/**
 * Match journal sources to the documents that created them. Quotes and orders
 * never post to the general ledger. Never match a document on its UUID alone:
 * the source type must also agree to avoid displaying an unrelated entry.
 */
export type PostingJournalEntityType = AttachmentEntityType | "supplier_payment";

const SOURCES: Partial<Record<PostingJournalEntityType, readonly string[]>> = {
  sales_invoice: ["sales_invoice"],
  sales_credit_note: ["sales_credit_note"],
  sales_receipt: ["customer_payment"],
  purchase_bill: ["purchase_bill"],
  purchase_credit_note: ["purchase_credit_note"],
  purchase_expense: ["expense"],
  supplier_payment: ["supplier_payment"],
  bank_transfer: ["bank_transfer"],
  money_sales_receipt: ["other"],
  money_customer_refund: ["other"],
  money_supplier_refund: ["other"],
  money_receive: ["other"],
  money_deposit: ["other"],
  money_card_payment: ["other"],
  money_adjustment: ["other"],
  journal: ["manual", "opening_balance", "reversal", "other"],
};

export function postingJournalSourceTypes(entityType: PostingJournalEntityType): readonly string[] {
  return SOURCES[entityType] ?? [];
}

export function isPostingJournalEntityType(value: unknown): value is PostingJournalEntityType {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(SOURCES, value);
}
