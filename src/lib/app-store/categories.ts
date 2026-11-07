/** Configurable marketplace taxonomy (PRD §6). Apps may belong to many categories. */

export type AppCategoryCode =
  | "ecommerce"
  | "payment_gateways"
  | "point_of_sale"
  | "banking_financial"
  | "inventory_warehousing"
  | "payroll_hr"
  | "expense_management"
  | "document_capture"
  | "crm"
  | "project_management"
  | "time_tracking"
  | "tax_compliance"
  | "reporting_analytics"
  | "automation_workflows"
  | "property_management"
  | "hospitality"
  | "shipping_logistics"
  | "subscriptions_billing"
  | "ap_automation"
  | "ar_collections"
  | "budgeting_forecasting"
  | "professional_services"
  | "manufacturing"
  | "other";

export type AppCategoryDefinition = {
  code: AppCategoryCode;
  name: string;
  description: string;
  sortOrder: number;
};

export const APP_CATEGORIES: readonly AppCategoryDefinition[] = [
  {
    code: "ecommerce",
    name: "E-commerce",
    description: "Online stores, marketplaces and order sync.",
    sortOrder: 10,
  },
  {
    code: "payment_gateways",
    name: "Payment Gateways",
    description: "Card processors, wallets and payout reconciliation.",
    sortOrder: 20,
  },
  {
    code: "point_of_sale",
    name: "Point of Sale",
    description: "In-store sales and register settlement.",
    sortOrder: 30,
  },
  {
    code: "banking_financial",
    name: "Banking & Financial Data",
    description: "Bank feeds, open banking and financial data.",
    sortOrder: 40,
  },
  {
    code: "inventory_warehousing",
    name: "Inventory & Warehousing",
    description: "Stock levels, fulfilment and COGS.",
    sortOrder: 50,
  },
  {
    code: "payroll_hr",
    name: "Payroll & HR",
    description: "Pay runs, employees and workforce costs.",
    sortOrder: 60,
  },
  {
    code: "expense_management",
    name: "Expense Management",
    description: "Employee spend, cards and reimbursements.",
    sortOrder: 70,
  },
  {
    code: "document_capture",
    name: "Document Capture & OCR",
    description: "Receipt and bill capture into purchases.",
    sortOrder: 80,
  },
  {
    code: "crm",
    name: "CRM & Customer Management",
    description: "Contacts, pipelines and customer data.",
    sortOrder: 90,
  },
  {
    code: "project_management",
    name: "Project Management",
    description: "Projects, jobs and billable work.",
    sortOrder: 100,
  },
  {
    code: "time_tracking",
    name: "Time Tracking",
    description: "Timesheets and labour costing.",
    sortOrder: 110,
  },
  {
    code: "tax_compliance",
    name: "Tax & Compliance",
    description: "Tax filing, reporting and statutory packs.",
    sortOrder: 120,
  },
  {
    code: "reporting_analytics",
    name: "Reporting & Analytics",
    description: "BI, dashboards and data export.",
    sortOrder: 130,
  },
  {
    code: "automation_workflows",
    name: "Automation & Workflows",
    description: "Triggers, rules and orchestration.",
    sortOrder: 140,
  },
  {
    code: "property_management",
    name: "Property Management",
    description: "Rentals, trusts and property accounting.",
    sortOrder: 150,
  },
  {
    code: "hospitality",
    name: "Hospitality & Restaurants",
    description: "Hotels, short-lets and food service.",
    sortOrder: 160,
  },
  {
    code: "shipping_logistics",
    name: "Shipping & Logistics",
    description: "Carriers, fulfilment and freight costs.",
    sortOrder: 170,
  },
  {
    code: "subscriptions_billing",
    name: "Subscriptions & Recurring Billing",
    description: "Recurring revenue and subscription ops.",
    sortOrder: 180,
  },
  {
    code: "ap_automation",
    name: "Accounts Payable Automation",
    description: "Bill capture, approval and payment runs.",
    sortOrder: 190,
  },
  {
    code: "ar_collections",
    name: "Accounts Receivable & Collections",
    description: "Invoicing reminders and collections.",
    sortOrder: 200,
  },
  {
    code: "budgeting_forecasting",
    name: "Budgeting & Forecasting",
    description: "Plans, forecasts and variance analysis.",
    sortOrder: 210,
  },
  {
    code: "professional_services",
    name: "Professional Services",
    description: "Firms, retainers and client work.",
    sortOrder: 220,
  },
  {
    code: "manufacturing",
    name: "Manufacturing",
    description: "BOM, WIP and manufacturing costs.",
    sortOrder: 230,
  },
  {
    code: "other",
    name: "Other Business Applications",
    description: "Integrations that do not fit another category.",
    sortOrder: 999,
  },
] as const;

export function appCategoryByCode(code: string): AppCategoryDefinition | undefined {
  return APP_CATEGORIES.find((c) => c.code === code);
}
