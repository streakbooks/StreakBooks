import { REPORT_CATALOG } from "@/lib/reports/catalog";
import { navItems } from "@/lib/nav";

export type PaletteAction = {
  id: string;
  group: "Create" | "Go to" | "Reports";
  label: string;
  keywords: string;
  href: string;
  search?: Record<string, string>;
};

const CREATE: PaletteAction[] = [
  {
    id: "new-invoice",
    group: "Create",
    label: "New invoice",
    keywords: "sales customer",
    href: "/sales/invoices/new",
  },
  {
    id: "new-bill",
    group: "Create",
    label: "New bill",
    keywords: "purchase supplier",
    href: "/purchases/bills/new",
  },
  {
    id: "new-expense",
    group: "Create",
    label: "Spend money",
    keywords: "spend receipt company paid direct expense banking",
    href: "/banking/spend-money",
  },
  {
    id: "new-receive-money",
    group: "Create",
    label: "Receive money",
    keywords: "receive money other income banking",
    href: "/banking/receive-money",
  },
  {
    id: "new-expense-claim",
    group: "Create",
    label: "New expense claim",
    keywords: "employee claim reimbursement mileage expense management",
    href: "/expense-management/my-expenses",
    search: { create: "true" },
  },
  {
    id: "new-quote",
    group: "Create",
    label: "New quote",
    keywords: "sales customer estimate",
    href: "/sales/quotes/new",
  },
  {
    id: "new-sales-order",
    group: "Create",
    label: "New sales order",
    keywords: "customer order confirmation draft invoice",
    href: "/sales/orders/new",
  },
  {
    id: "new-sales-credit-note",
    group: "Create",
    label: "New sales credit note",
    keywords: "customer refund credit",
    href: "/sales/credit-notes/new",
  },
  {
    id: "new-recurring-invoice",
    group: "Create",
    label: "New recurring invoice",
    keywords: "recurring sales schedule template",
    href: "/sales/recurring/new",
  },
  {
    id: "new-recurring-bill",
    group: "Create",
    label: "New recurring bill",
    keywords: "recurring purchase schedule template",
    href: "/purchases/recurring/new",
  },
  {
    id: "new-customer",
    group: "Create",
    label: "New customer",
    keywords: "contact customer",
    href: "/contacts/new",
    search: { kind: "customer" },
  },
  {
    id: "new-supplier",
    group: "Create",
    label: "New supplier",
    keywords: "contact supplier vendor",
    href: "/contacts/new",
    search: { kind: "supplier" },
  },
  {
    id: "new-product",
    group: "Create",
    label: "New product / service",
    keywords: "catalogue item sku service",
    href: "/products-services",
    search: { create: "true" },
  },
  {
    id: "new-receive-payment",
    group: "Create",
    label: "Receive customer payment",
    keywords: "customer payment received ar receipt allocate invoice",
    href: "/sales/receipts/new",
  },
  {
    id: "new-sales-receipt",
    group: "Create",
    label: "New sales receipt",
    keywords: "cash sale sales receipt money document",
    href: "/banking/money-documents/new",
    search: { kind: "sales_receipt" },
  },
  {
    id: "new-purchase-order",
    group: "Create",
    label: "New purchase order",
    keywords: "supplier order",
    href: "/purchases/orders/new",
  },
  {
    id: "new-purchase-requisition",
    group: "Create",
    label: "New purchase requisition",
    keywords: "purchase request approval requisition",
    href: "/purchases/requisitions",
    search: { create: "true" },
  },
  {
    id: "new-supplier-payment",
    group: "Create",
    label: "New supplier payment",
    keywords: "pay bill payment",
    href: "/purchases/payments/new",
  },
  {
    id: "new-manual-journal",
    group: "Create",
    label: "New manual journal",
    keywords: "journal post accounting",
    href: "/accounting/journals/new",
    search: { mode: "post" },
  },
  {
    id: "new-bank-transfer",
    group: "Create",
    label: "New bank transfer",
    keywords: "transfer between accounts banking",
    href: "/banking/transfers/new",
  },
];

export function buildPaletteActions(): PaletteAction[] {
  return [
    ...CREATE,
    {
      id: "nav-sales-orders",
      group: "Go to",
      label: "Sales orders",
      keywords: "customer order confirmation draft invoice",
      href: "/sales/orders",
    },
    {
      id: "nav-deferrals",
      group: "Go to",
      label: "Prepayments & deferred income",
      keywords: "recognition prepaid expense deferred revenue schedule",
      href: "/accounting",
      search: { tab: "deferrals" },
    },
    ...navItems.map<PaletteAction>((n) => ({
      id: `nav-${n.to}`,
      group: "Go to",
      label: n.label,
      keywords: n.description,
      href: n.to,
      ...(n.to === "/settings" ? { search: { section: "overview" } } : {}),
    })),
    ...REPORT_CATALOG.filter((r) => r.status === "ready" && r.runner !== "link").map<PaletteAction>(
      (r) => ({
        id: `report-${r.id}`,
        group: "Reports",
        label: r.title,
        keywords: r.tags.join(" "),
        href: `/reports/${r.id}`,
      }),
    ),
  ];
}

/** Case-insensitive match on label and keywords; all words must appear. Empty query returns nothing. */
export function filterPaletteActions(actions: PaletteAction[], query: string): PaletteAction[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return actions.filter((a) => {
    const hay = `${a.label} ${a.keywords}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** What to show before the user types: the create shortcuts, then the main pages. */
export function suggestedPaletteActions(actions: PaletteAction[]): PaletteAction[] {
  return [
    ...actions.filter((a) => a.group === "Create").slice(0, 5),
    ...actions.filter((a) => a.group === "Go to").slice(0, 6),
  ];
}
