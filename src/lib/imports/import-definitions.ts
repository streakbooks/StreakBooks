import { toCsv } from "@/lib/sales/csv";

/**
 * Central import definitions. A definition describes the file contract, NOT permission to
 * write accounting records. Each importer must use its authorised domain service.
 */
export type ImportModule =
  | "banking"
  | "sales"
  | "purchases"
  | "contacts"
  | "products"
  | "accounting"
  | "fixed_assets"
  | "inventory"
  | "budgets"
  | "payroll"
  | "tax"
  | "projects";

export type ImportField = Readonly<{
  key: string;
  label: string;
  required: boolean;
  example: string;
  description: string;
}>;

export type ImportDefinition = Readonly<{
  module: ImportModule;
  documentType: string;
  fields: readonly ImportField[];
  /** A schema is not evidence that the write workflow is implemented. */
  writeStatus: "implemented" | "not_implemented";
}>;

const field = (
  key: string,
  label: string,
  required: boolean,
  example: string,
  description: string,
): ImportField => ({ key, label, required, example, description });

const defs: ImportDefinition[] = [
  {
    module: "banking",
    documentType: "Bank transactions",
    writeStatus: "implemented",
    fields: [
      field("date", "Date", true, "2026-10-01", "Bank transaction date, YYYY-MM-DD"),
      field("description", "Description", true, "Example payment", "Statement narration"),
      field(
        "amount",
        "Amount",
        true,
        "125.00",
        "Signed amount: money in positive, money out negative",
      ),
      field("payee", "Payee", false, "Example Customer", "Counterparty"),
      field("reference", "Reference", false, "INV-1001", "Bank reference"),
      field("bank_id", "Bank Transaction ID", false, "BANK-0001", "Unique transaction identifier"),
      field("balance", "Running Balance", false, "", "Optional statement running balance"),
    ],
  },
  {
    module: "contacts",
    documentType: "Customers and suppliers",
    writeStatus: "implemented",
    fields: [
      field("name", "name", true, "Example Supplier", "Contact name"),
      field("kind", "kind", false, "supplier", "customer, supplier or both"),
      field("email", "email", false, "accounts@example.com", "Email"),
      field("phone", "phone", false, "", "Phone"),
      field("tax_number", "tax_number", false, "", "Tax registration"),
      field("payment_terms_days", "payment_terms_days", false, "30", "Payment terms in days"),
    ],
  },
  {
    module: "sales",
    documentType: "Invoices",
    writeStatus: "not_implemented",
    fields: [
      field("invoice_number", "Invoice Number", true, "INV-1001", "External invoice number"),
      field("customer", "Customer", true, "Example Customer", "Existing customer"),
      field("invoice_date", "Invoice Date", true, "2026-10-01", "Document date"),
      field("due_date", "Due Date", true, "2026-10-31", "Payment due date"),
      field("account_code", "Revenue Account", true, "4000", "Revenue account"),
      field("description", "Description", true, "Consulting", "Line description"),
      field("quantity", "Quantity", true, "1", "Line quantity"),
      field(
        "unit_price",
        "Unit Price",
        true,
        "100.00",
        "Price excluding tax unless configured otherwise",
      ),
      field("tax_code", "Tax Code", false, "", "Applicable tax code"),
    ],
  },
  {
    module: "purchases",
    documentType: "Bills",
    writeStatus: "not_implemented",
    fields: [
      field("bill_number", "Bill Number", true, "BILL-1001", "Supplier invoice reference"),
      field("supplier", "Supplier", true, "Example Supplier", "Existing supplier"),
      field("bill_date", "Bill Date", true, "2026-10-01", "Document date"),
      field("due_date", "Due Date", true, "2026-10-31", "Payment due date"),
      field("account_code", "Expense Account", true, "6000", "Expense or asset account"),
      field("description", "Description", true, "Materials", "Line description"),
      field("quantity", "Quantity", true, "1", "Line quantity"),
      field(
        "unit_price",
        "Unit Price",
        true,
        "50.00",
        "Price excluding tax unless configured otherwise",
      ),
      field("tax_code", "Tax Code", false, "", "Optional purchase tax code effective on bill date"),
    ],
  },
  {
    module: "products",
    documentType: "Products and services",
    writeStatus: "implemented",
    fields: [
      field("sku", "SKU", true, "ITEM-001", "Unique item code"),
      field("name", "Name", true, "Example Item", "Item name"),
      field("type", "Type", true, "service", "Product or service"),
      field("sale_price", "Sale Price", false, "100.00", "Sales price"),
      field("purchase_price", "Purchase Price", false, "50.00", "Purchase price"),
    ],
  },
  {
    module: "accounting",
    documentType: "Chart of accounts",
    writeStatus: "implemented",
    fields: [
      field("code", "Code", true, "6000", "Account code"),
      field("name", "Name", true, "Office Expenses", "Account name"),
      field("type", "Type", true, "expense", "Account classification"),
      field("description", "Description", false, "", "Account description"),
      field("parent_code", "Parent Code", false, "", "Parent account"),
    ],
  },
  {
    module: "fixed_assets",
    documentType: "Asset register",
    writeStatus: "implemented",
    fields: [
      field("asset_code", "Asset Code", true, "FA-001", "Unique asset reference"),
      field("description", "Description", true, "Laptop", "Asset description"),
      field("acquisition_date", "Acquisition Date", true, "2026-10-01", "Acquisition date"),
      field("cost", "Cost", true, "1200.00", "Original cost"),
      field(
        "accumulated_depreciation",
        "Accumulated Depreciation",
        false,
        "0.00",
        "Opening accumulated depreciation; not reposted to the ledger",
      ),
      field(
        "opening_depreciation_through",
        "Opening Depreciation Through",
        false,
        "2026-09-30",
        "Required for assets with brought-forward accumulated depreciation; last day represented by the opening amount",
      ),
      field(
        "asset_account_code",
        "Asset Account Code",
        true,
        "1500",
        "Existing fixed asset account, type asset",
      ),
      field(
        "accumulated_account_code",
        "Accumulated Depreciation Account Code",
        true,
        "1590",
        "Existing accumulated depreciation account, type asset",
      ),
      field(
        "expense_account_code",
        "Depreciation Expense Account Code",
        true,
        "7000",
        "Existing depreciation expense account",
      ),
      field(
        "depreciation_method",
        "Depreciation Method",
        true,
        "straight_line",
        "straight_line, reducing_balance or none",
      ),
      field(
        "useful_life_months",
        "Useful Life Months",
        false,
        "36",
        "Required when straight_line is selected",
      ),
      field(
        "annual_rate_percent",
        "Annual Rate Percent",
        false,
        "",
        "Required when reducing_balance is selected; 25.00 means 25 percent",
      ),
      field(
        "residual_value",
        "Residual Value",
        false,
        "0.00",
        "Expected amount remaining after depreciation",
      ),
      field(
        "depreciation_start_date",
        "Depreciation Start Date",
        false,
        "2026-10-01",
        "Defaults to acquisition date",
      ),
      field("asset_type", "Asset Type", false, "", "Optional existing active asset type name"),
    ],
  },
  {
    module: "inventory",
    documentType: "Opening stock",
    writeStatus: "not_implemented",
    fields: [
      field("sku", "SKU", true, "ITEM-001", "Existing inventory item"),
      field("quantity", "Quantity", true, "10", "Opening quantity"),
      field("unit_cost", "Unit Cost", true, "50.00", "Opening unit cost"),
      field("as_of", "As Of", true, "2026-10-01", "Stock valuation date"),
    ],
  },
  {
    module: "budgets",
    documentType: "Monthly budget",
    writeStatus: "implemented",
    fields: [
      field("account_code", "Account code", true, "6000", "Existing account code"),
      field("account_name", "Account name", false, "Office Expenses", "Account label"),
      ...Array.from({ length: 12 }, (_, i) =>
        field("month_" + (i + 1), "Month " + (i + 1), true, "100.00", "Monthly budget amount"),
      ),
    ],
  },
  {
    module: "payroll",
    documentType: "Employee master",
    writeStatus: "not_implemented",
    fields: [
      field(
        "employee_number",
        "Employee number",
        true,
        "EMP-001",
        "Import via Payroll → Employees (CSV upload). This Imports Centre template documents the column contract only.",
      ),
      field("first_name", "First name", true, "Alex", "Given name"),
      field("last_name", "Last name", true, "Example", "Family name"),
      field("email", "Email", false, "alex@example.com", "Work email"),
      field("hire_date", "Hire date", true, "2026-10-01", "Employment start date (YYYY-MM-DD)"),
      field("department", "Department", false, "Operations", "Department label"),
      field("payroll_country_code", "Payroll country", true, "GB", "ISO country code"),
    ],
  },
  {
    module: "tax",
    documentType: "Tax rates",
    writeStatus: "not_implemented",
    fields: [
      field("code", "Code", true, "GST10", "Tax code"),
      field("name", "Name", true, "GST 10%", "Tax name"),
      field("rate", "Rate", true, "10", "Percentage rate"),
      field("country", "Country", true, "AU", "Tax jurisdiction"),
    ],
  },
  {
    module: "projects",
    documentType: "Projects",
    writeStatus: "implemented",
    fields: [
      field("project_code", "Project Code", true, "PRJ-001", "Unique project reference"),
      field("name", "Name", true, "Example Project", "Project name"),
      field("customer", "Customer", false, "Example Customer", "Existing customer"),
      field("start_date", "Start Date", false, "2026-10-01", "Start date"),
    ],
  },
];

export const IMPORT_DEFINITIONS: readonly ImportDefinition[] = defs;

export function getImportDefinition(module: ImportModule, documentType: string): ImportDefinition {
  const found = defs.find((d) => d.module === module && d.documentType === documentType);
  if (!found) throw new Error("Unknown import definition");
  return found;
}

export function importTemplateCsv(definition: ImportDefinition, includeExample = true): string {
  return toCsv(
    definition.fields.map((f) => f.label),
    includeExample ? [definition.fields.map((f) => f.example)] : [],
  );
}

export function importFieldDictionaryCsv(definition: ImportDefinition): string {
  return toCsv(
    ["Field", "Required", "Description", "Example"],
    definition.fields.map((f) => [f.label, f.required ? "Yes" : "No", f.description, f.example]),
  );
}
