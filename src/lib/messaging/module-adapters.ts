import type { MessagingVisibility } from "./types";

/**
 * Future modules register conversation capabilities here.
 * External messaging stays off until a module explicitly enables it and tests pass.
 */
export type MessagingRecordAdapter = {
  recordType: string;
  label: string;
  defaultVisibility: MessagingVisibility;
  /** When true, customer/vendor visibility may be requested after manage_external. */
  allowExternal: boolean;
  requiredViewPermission: string;
  buildDeepLink: (recordId: string) => string;
  retentionClass: "standard" | "hr_sensitive" | "payroll_restricted" | "external";
};

export const MESSAGING_RECORD_ADAPTERS: readonly MessagingRecordAdapter[] = [
  {
    recordType: "sales_invoice",
    label: "Sales invoice",
    defaultVisibility: "internal",
    allowExternal: true,
    requiredViewPermission: "sales.view",
    buildDeepLink: (id) => `/sales/invoices/${id}`,
    retentionClass: "standard",
  },
  {
    recordType: "sales_quote",
    label: "Sales quote",
    defaultVisibility: "internal",
    allowExternal: true,
    requiredViewPermission: "sales.view",
    buildDeepLink: (id) => `/sales/quotes/${id}`,
    retentionClass: "standard",
  },
  {
    recordType: "sales_credit_note",
    label: "Sales credit note",
    defaultVisibility: "internal",
    allowExternal: true,
    requiredViewPermission: "sales.view",
    buildDeepLink: (id) => `/sales/credit-notes/${id}`,
    retentionClass: "standard",
  },
  {
    recordType: "journal",
    label: "Journal",
    defaultVisibility: "internal",
    allowExternal: false,
    requiredViewPermission: "banking.view",
    buildDeepLink: (id) => `/banking/journal/${id}`,
    retentionClass: "standard",
  },
  {
    recordType: "purchase_order",
    label: "Purchase order",
    defaultVisibility: "internal",
    allowExternal: true,
    requiredViewPermission: "purchases.view",
    buildDeepLink: (id) => `/purchases/orders/${id}`,
    retentionClass: "standard",
  },
  {
    recordType: "purchase_bill",
    label: "Purchase bill",
    defaultVisibility: "internal",
    allowExternal: true,
    requiredViewPermission: "purchases.view",
    buildDeepLink: (id) => `/purchases/bills/${id}`,
    retentionClass: "standard",
  },
  {
    recordType: "supplier_payment",
    label: "Supplier payment",
    defaultVisibility: "internal",
    allowExternal: false,
    requiredViewPermission: "purchases.view",
    buildDeepLink: (id) => `/purchases/payments/${id}`,
    retentionClass: "standard",
  },
  {
    recordType: "expense_claim",
    label: "Expense claim",
    defaultVisibility: "internal",
    allowExternal: false,
    requiredViewPermission: "expenses.view",
    buildDeepLink: (id) => `/expense-management/claims/${id}`,
    retentionClass: "standard",
  },
  {
    recordType: "hr_leave_request",
    label: "Leave request",
    defaultVisibility: "hr_private",
    allowExternal: false,
    requiredViewPermission: "hr.leave.manage",
    buildDeepLink: (id) => `/hr/leave/${id}`,
    retentionClass: "hr_sensitive",
  },
  {
    recordType: "contact",
    label: "Contact",
    defaultVisibility: "internal",
    allowExternal: false,
    requiredViewPermission: "contacts.manage",
    buildDeepLink: (id) => `/contacts/${id}`,
    retentionClass: "standard",
  },
  {
    recordType: "advisor_engagement",
    label: "Advisor engagement",
    defaultVisibility: "advisor",
    allowExternal: false,
    requiredViewPermission: "messaging.create",
    buildDeepLink: (id) => `/advisors-admin/engagements?id=${id}`,
    retentionClass: "external",
  },
];

export function getMessagingRecordAdapter(recordType: string): MessagingRecordAdapter | undefined {
  return MESSAGING_RECORD_ADAPTERS.find((adapter) => adapter.recordType === recordType);
}
