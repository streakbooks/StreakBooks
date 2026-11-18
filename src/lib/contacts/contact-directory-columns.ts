/** Allowed, user-selectable columns in the Contacts directory. */
export const CONTACT_DIRECTORY_COLUMNS = [
  { id: "name", label: "Contact", sortField: "name", required: true },
  { id: "account_number", label: "Account #", sortField: "account" },
  { id: "kind", label: "Roles", sortField: "roles" },
  { id: "email", label: "Email", sortField: "email" },
  { id: "phone", label: "Phone", sortField: "phone" },
  { id: "payment_terms_days", label: "Terms", sortField: "terms" },
  { id: "billing_city", label: "City", sortField: "city" },
  { id: "billing_region", label: "State / Region", sortField: "state" },
  { id: "billing_postal", label: "Postal code", sortField: "postal" },
  { id: "billing_country", label: "Country", sortField: "country" },
  { id: "billing_address_line1", label: "Billing address" },
  { id: "delivery_city", label: "Delivery city" },
  { id: "delivery_region", label: "Delivery state / region" },
  { id: "delivery_postal", label: "Delivery postal code" },
  { id: "delivery_country", label: "Delivery country" },
  { id: "delivery_address_line1", label: "Delivery address" },
  { id: "legal_name", label: "Legal name", sortField: "legal" },
  { id: "tax_number", label: "Tax / VAT ID", sortField: "tax" },
  { id: "website", label: "Website" },
  { id: "default_currency", label: "Currency", sortField: "currency" },
  { id: "credit_limit_minor", label: "Credit limit", sortField: "credit" },
  { id: "is_active", label: "Status", sortField: "status" },
  { id: "created_at", label: "Created", sortField: "created" },
  { id: "updated_at", label: "Updated", sortField: "modified" },
] as const;

export type ContactDirectoryColumnId = (typeof CONTACT_DIRECTORY_COLUMNS)[number]["id"];

export const DEFAULT_CONTACT_DIRECTORY_COLUMNS: ContactDirectoryColumnId[] = [
  "name",
  "account_number",
  "kind",
  "email",
  "phone",
  "payment_terms_days",
];

/** Always display the name and ignore unknown/duplicate saved columns. */
export function normalizeContactDirectoryColumns(value: unknown): ContactDirectoryColumnId[] {
  if (!Array.isArray(value)) return [...DEFAULT_CONTACT_DIRECTORY_COLUMNS];
  const allowed = new Set<string>(CONTACT_DIRECTORY_COLUMNS.map((column) => column.id));
  const selected: ContactDirectoryColumnId[] = ["name"];
  for (const item of value) {
    if (
      typeof item !== "string" ||
      !allowed.has(item) ||
      selected.includes(item as ContactDirectoryColumnId)
    ) {
      continue;
    }
    selected.push(item as ContactDirectoryColumnId);
  }
  return selected;
}

export function toggleContactDirectoryColumn(
  selected: ContactDirectoryColumnId[],
  column: ContactDirectoryColumnId,
  enabled: boolean,
): ContactDirectoryColumnId[] {
  if (column === "name") return selected;
  return normalizeContactDirectoryColumns(
    enabled ? [...selected, column] : selected.filter((value) => value !== column),
  );
}

/** Bulk operations are deliberately limited to the currently visible page. */
export function selectedContactsOnPage(selected: string[], pageContactIds: string[]): string[] {
  const allowed = new Set(pageContactIds);
  return [...new Set(selected)].filter((id) => allowed.has(id));
}

/** Preserve current saved-column IDs while supporting earlier directory aliases. */
const LEGACY_CONTACT_COLUMN_ALIASES = {
  account: "account_number",
  roles: "kind",
  terms: "payment_terms_days",
  city: "billing_city",
  state: "billing_region",
  postal: "billing_postal",
  country: "billing_country",
  address: "billing_address_line1",
  currency: "default_currency",
  status: "is_active",
} as const;
export const DEFAULT_HIDDEN_CONTACT_COLUMNS: ContactDirectoryColumnId[] =
  CONTACT_DIRECTORY_COLUMNS.map((column) => column.id).filter(
    (id) => !DEFAULT_CONTACT_DIRECTORY_COLUMNS.includes(id),
  );
export type ContactDirectoryRecord = Partial<
  Record<ContactDirectoryColumnId, string | number | boolean | null>
> & {
  id: string;
  name: string;
  kind: string;
  email: string | null;
  phone: string | null;
  payment_terms_days: number;
  account_number: string | null;
  is_active: boolean;
  billing_city: string | null;
  billing_region: string | null;
  billing_postal: string | null;
  billing_country: string | null;
  billing_address_line1: string | null;
  legal_name: string | null;
  tax_number: string | null;
  website: string | null;
  default_currency: string | null;
};

export function contactDirectoryCellValue(
  row: ContactDirectoryRecord,
  column: ContactDirectoryColumnId | keyof typeof LEGACY_CONTACT_COLUMN_ALIASES,
): string {
  const resolved =
    column in LEGACY_CONTACT_COLUMN_ALIASES
      ? LEGACY_CONTACT_COLUMN_ALIASES[column as keyof typeof LEGACY_CONTACT_COLUMN_ALIASES]
      : (column as ContactDirectoryColumnId);
  const values = {
    ...row,
    kind: row.kind === "both" ? "Customer & supplier" : row.kind,
    payment_terms_days: `${row.payment_terms_days}d`,
    is_active: row.is_active ? "Active" : "Inactive",
  };
  const value = values[resolved];
  return value == null || value === "" ? "—" : String(value);
}
