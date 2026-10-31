export const PURCHASES_SECTIONS = [
  { to: "/purchases", label: "Overview", exact: true },
  { to: "/purchases/bills", label: "Bills" },
  { to: "/purchases/expenses", label: "Expenses" },
  { to: "/purchases/suppliers", label: "Suppliers" },
  { to: "/purchases/payments", label: "Payments" },
  { to: "/purchases/credit-notes", label: "Credit notes" },
  { to: "/purchases/orders", label: "Purchase orders" },
  { to: "/purchases/recurring", label: "Recurring" },
  { to: "/purchases/employee-expenses", label: "Employee expenses" },
  { to: "/purchases/statements", label: "Statements" },
  { to: "/purchases/settings", label: "Settings" },
] as const;

export const SALES_SECTIONS = [
  { to: "/sales", label: "Overview", exact: true },
  { to: "/sales/invoices", label: "Invoices" },
  { to: "/sales/quotes", label: "Quotes" },
  { to: "/sales/receipts", label: "Receipts" },
  { to: "/sales/credit-notes", label: "Credit notes" },
  { to: "/sales/customers", label: "Customers" },
  { to: "/sales/recurring", label: "Recurring" },
  { to: "/sales/statements", label: "Statements" },
  { to: "/sales/reminders", label: "Reminders" },
  { to: "/sales/settings", label: "Settings" },
] as const;
