#!/usr/bin/env node
/**
 * Source evidence that high-traffic modules compose ListWorkspace / RecordWorkspace.
 * Complements PageHeader-bypass checks in check-module-contracts.mjs.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

const required = [
  ["src/routes/_authenticated/banking/index.tsx", "ListWorkspace"],
  ["src/routes/_authenticated/banking/transactions.tsx", "ListWorkspace"],
  ["src/routes/_authenticated/banking/reconcile.tsx", "ListWorkspace"],
  ["src/screens/banking/transfers.tsx", "ListWorkspace"],
  ["src/screens/banking/transfers.tsx", "TransactionWorkspace"],
  ["src/screens/banking/transfers.tsx", "TotalsSummary"],
  ["src/screens/sales/receipts.new.tsx", "TransactionWorkspace"],
  ["src/screens/sales/receipts.new.tsx", "TotalsSummary"],
  ["src/screens/purchases/payments.new.tsx", "TransactionWorkspace"],
  ["src/screens/purchases/payments.new.tsx", "TotalsSummary"],
  ["src/routes/_authenticated/sales/index.tsx", "ListWorkspace"],
  ["src/routes/_authenticated/sales/index.tsx", "WorkspaceInsights"],
  ["src/routes/_authenticated/sales/invoices.index.tsx", "ListWorkspace"],
  ["src/routes/_authenticated/sales/invoices.$invoiceId.index.tsx", "RecordWorkspace"],
  ["src/routes/_authenticated/sales/invoices.$invoiceId.index.tsx", "WorkspaceInsights"],
  ["src/routes/_authenticated/sales/quotes.$quoteId.index.tsx", "WorkspaceInsights"],
  ["src/routes/_authenticated/sales/credit-notes.$creditNoteId.index.tsx", "WorkspaceInsights"],
  ["src/routes/_authenticated/sales/receipts.$receiptId.tsx", "WorkspaceInsights"],
  ["src/routes/_authenticated/purchases/index.tsx", "ListWorkspace"],
  ["src/routes/_authenticated/purchases/index.tsx", "WorkspaceInsights"],
  ["src/routes/_authenticated/purchases/bills.index.tsx", "ListWorkspace"],
  ["src/routes/_authenticated/purchases/bills.index.tsx", "WorkspaceInsights"],
  ["src/routes/_authenticated/purchases/bills.$billId.tsx", "RecordWorkspace"],
  ["src/routes/_authenticated/purchases/bills.$billId.tsx", "WorkspaceInsights"],
  ["src/screens/sales/recurring.tsx", "ListWorkspace"],
  ["src/screens/sales/recurring.tsx", "TransactionWorkspace"],
  ["src/screens/sales/recurring.tsx", "TotalsSummary"],
  ["src/screens/sales/orders.new.tsx", "TransactionWorkspace"],
  ["src/screens/sales/orders.new.tsx", "TotalsSummary"],
  ["src/screens/sales/orders.new.tsx", "FormGrid"],
  ["src/screens/sales/orders.new.tsx", "OrderEntryLines"],
  ["src/components/orders/OrderEntryLines.tsx", "EditableLineItemGrid"],
  ["src/components/orders/OrderEntryLines.tsx", "interpretLineGridKey"],
  ["src/screens/purchases/requisitions.tsx", "OrderEntryLines"],
  ["src/components/purchases/PurchasesDocumentLines.tsx", "TotalsSummary"],
  ["src/components/purchases/PurchasesDocumentLines.tsx", "interpretLineGridKey"],
  ["src/components/purchases/PurchasesDocumentLines.tsx", "EditableLineItemGrid"],
  ["src/components/sales/SalesDocumentLines.tsx", "EditableLineItemGrid"],
  ["src/components/sales/SalesDocumentLines.tsx", "interpretLineGridKey"],
  ["src/screens/purchases/bills.new.tsx", "FormGrid"],
  ["src/screens/purchases/bills.new.tsx", "PurchasesDocumentLines"],
  ["src/components/create-new/MoneyDocumentPanel.tsx", "FormGrid"],
  ["src/routes/_authenticated/purchases/payments.batch.tsx", "TransactionWorkspace"],
  ["src/routes/_authenticated/purchases/payments.batch.tsx", "TotalsSummary"],
  ["src/routes/_authenticated/purchases/payments.batch.tsx", "FormGrid"],
  ["src/screens/purchases/orders.detail.tsx", "RecordWorkspace"],
  ["src/screens/purchases/orders.detail.tsx", "WorkspaceInsights"],
  ["src/routes/_authenticated/purchases/expenses.$expenseId.tsx", "WorkspaceInsights"],
  ["src/routes/_authenticated/purchases/credit-notes.$creditNoteId.tsx", "WorkspaceInsights"],
  ["src/routes/_authenticated/purchases/payments.$paymentId.tsx", "WorkspaceInsights"],
  ["src/screens/expense-management/claim-detail.tsx", "WorkspaceInsights"],
  ["src/screens/expense-management/claims.tsx", "TransactionWorkspace"],
  ["src/screens/expense-management/claims.tsx", "EditableLineItemGrid"],
  ["src/screens/expense-management/claims.tsx", "TotalsSummary"],
  ["src/screens/expense-management/claims.tsx", "interpretLineGridKey"],
  ["src/screens/expense-management/claims.tsx", "FormGrid"],
  ["src/screens/purchases/requisitions.tsx", "TransactionWorkspace"],
  ["src/screens/purchases/requisitions.tsx", "TotalsSummary"],
  ["src/screens/purchases/requisitions.tsx", "FormGrid"],
  ["src/components/create-new/JournalPanels.tsx", "TransactionWorkspace"],
  ["src/components/create-new/JournalPanels.tsx", "TotalsSummary"],
  ["src/components/create-new/JournalPanels.tsx", "FormGrid"],
  ["src/components/create-new/JournalPanels.tsx", "interpretLineGridKey"],
  ["src/components/sales/SalesDocumentEditor.tsx", "TransactionWorkspace"],
  ["src/components/sales/SalesDocumentEditor.tsx", "TotalsSummary"],
  ["src/components/sales/SalesDocumentEditor.tsx", "FormGrid"],
  ["src/screens/purchases/expenses.new.tsx", "TransactionWorkspace"],
  ["src/screens/purchases/expenses.new.tsx", "EditableLineItemGrid"],
  ["src/screens/purchases/expenses.new.tsx", "TotalsSummary"],
  ["src/screens/purchases/expenses.new.tsx", "interpretLineGridKey"],
  ["src/screens/purchases/expenses.new.tsx", "FormGrid"],
  ["src/screens/purchases/orders.new.tsx", "TransactionWorkspace"],
  ["src/screens/purchases/orders.new.tsx", "EditableLineItemGrid"],
  ["src/screens/purchases/orders.new.tsx", "TotalsSummary"],
  ["src/screens/purchases/orders.new.tsx", "interpretLineGridKey"],
  ["src/screens/purchases/orders.new.tsx", "FormGrid"],
  ["src/screens/purchases/credit-notes.new.tsx", "TransactionWorkspace"],
  ["src/screens/purchases/credit-notes.new.tsx", "EditableLineItemGrid"],
  ["src/screens/purchases/credit-notes.new.tsx", "TotalsSummary"],
  ["src/screens/purchases/credit-notes.new.tsx", "interpretLineGridKey"],
  ["src/screens/purchases/credit-notes.new.tsx", "FormGrid"],
  ["src/screens/purchases/credit-notes.new.tsx", "StatusBadge"],
  ["src/screens/sales/receipts.new.tsx", "FormGrid"],
  ["src/screens/purchases/payments.new.tsx", "FormGrid"],
  ["src/screens/banking/transfers.tsx", "FormGrid"],
  ["src/screens/banking/transfers.tsx", "StatusBadge"],
  ["src/screens/expense-management/claims.tsx", "StatusBadge"],
  ["src/screens/purchases/bills.new.tsx", "StatusBadge"],
  ["src/components/sales/SalesDocumentEditor.tsx", "ErrorState"],
  ["src/components/create-new/JournalPanels.tsx", "ErrorState"],
  ["src/routes/_authenticated/banking/spend-money.tsx", "NewExpense"],
  ["src/routes/_authenticated/banking/receive-money.tsx", "MoneyDocumentPanel"],
  ["src/components/create-new/MoneyDocumentPanel.tsx", "TransactionWorkspace"],
  ["src/components/create-new/MoneyDocumentPanel.tsx", "TotalsSummary"],
  ["src/screens/payroll/employee-detail.tsx", "WorkspaceInsights"],
  ["src/screens/payroll/run-detail.tsx", "WorkspaceInsights"],
  ["src/screens/payroll/payslip-detail.tsx", "WorkspaceInsights"],
  ["src/screens/app-store/app-detail.tsx", "WorkspaceInsights"],
  ["src/screens/products-services.tsx", "WorkspaceInsights"],
  ["src/routes/_authenticated/budgets/$budgetId.tsx", "WorkspaceInsights"],
  ["src/routes/_authenticated/banking/index.tsx", "WorkspaceInsights"],
  ["src/routes/_authenticated/banking/journal.$journalId.tsx", "WorkspaceInsights"],
  ["src/screens/contacts/index.tsx", "ListWorkspace"],
  ["src/routes/_authenticated/contacts/$contactId.tsx", "RecordWorkspace"],
  ["src/routes/_authenticated/contacts/$contactId.tsx", "WorkspaceInsights"],
  ["src/routes/_authenticated/notifications.tsx", "ListWorkspace"],
  ["src/routes/_authenticated/index.tsx", "ListWorkspace"],
  ["src/routes/_authenticated/index.tsx", "WorkspaceInsights"],
  ["src/screens/accounting.tsx", "ListWorkspace"],
  ["src/screens/crm/overview.tsx", "ListWorkspace"],
  ["src/screens/pos/index.tsx", "ListWorkspace"],
  ["src/screens/hr/overview.tsx", "ListWorkspace"],
  ["src/screens/messages/index.tsx", "ListWorkspace"],
  ["src/screens/property-management/overview.tsx", "ListWorkspace"],
  ["src/screens/expense-management/settings.tsx", "ListWorkspace"],
  ["e2e/ui/main.tsx", "ListWorkspace"],
  ["e2e/ui/main.tsx", "RecordWorkspace"],
];

for (const [rel, token] of required) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    failures.push(`Missing required file: ${rel}`);
    continue;
  }
  const source = fs.readFileSync(file, "utf8");
  if (!source.includes(token)) {
    failures.push(`${rel} must compose ${token}`);
  }
}

if (failures.length) {
  for (const reason of failures) process.stderr.write(`FAIL ${reason}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Workspace adoption passed: ${required.length} high-traffic surfaces compose shared chrome.\n`,
  );
}
