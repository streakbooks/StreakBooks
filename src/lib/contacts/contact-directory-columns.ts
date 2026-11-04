import type { ContactSortField } from "./contact-helpers";

/**
 * Directory column catalogue. Values come from the contacts query; no derived
 * accounting balances or fabricated address fields are shown.
 */
export const CONTACT_DIRECTORY_COLUMNS: ReadonlyArray<{
  id: ContactDirectoryColumnId;
  label: string;
  sortField?: ContactSortField;
  required?: boolean;
}> = [
  { id: "name", label: "Name", sortField: "name", required: true },
  { id: "account", label: "Account #", sortField: "account" },
  { id: "roles", label: "Roles", sortField: "roles" },
  { id: "email", label: "Email", sortField: "email" },
  { id: "phone", label: "Phone", sortField: "phone" },
  { id: "terms", label: "Terms", sortField: "terms" },
  { id: "city", label: "City", sortField: "city" },
  { id: "state", label: "State / Province", sortField: "state" },
  { id: "postal", label: "Postal / ZIP code" },
  { id: "country", label: "Country" },
  { id: "address", label: "Street address" },
  { id: "legal_name", label: "Legal name" },
  { id: "tax_number", label: "Tax ID" },
  { id: "website", label: "Website" },
  { id: "currency", label: "Default currency" },
  { id: "status", label: "Status" },
];

export type ContactDirectoryColumnId =
  | "name"
  | "account"
  | "roles"
  | "email"
  | "phone"
  | "terms"
  | "city"
  | "state"
  | "postal"
  | "country"
  | "address"
  | "legal_name"
  | "tax_number"
  | "website"
  | "currency"
  | "status";

/** Keep existing table layout until someone opts in to more details. */
export const DEFAULT_HIDDEN_CONTACT_COLUMNS: ContactDirectoryColumnId[] = [
  "city",
  "state",
  "postal",
  "country",
  "address",
  "legal_name",
  "tax_number",
  "website",
  "currency",
  "status",
];

export type ContactDirectoryRecord = {
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
  column: ContactDirectoryColumnId,
): string {
  const values: Record<ContactDirectoryColumnId, string | number | null> = {
    name: row.name,
    account: row.account_number,
    roles: row.kind === "both" ? "Customer & supplier" : row.kind,
    email: row.email,
    phone: row.phone,
    terms: `${row.payment_terms_days}d`,
    city: row.billing_city,
    state: row.billing_region,
    postal: row.billing_postal,
    country: row.billing_country,
    address: row.billing_address_line1,
    legal_name: row.legal_name,
    tax_number: row.tax_number,
    website: row.website,
    currency: row.default_currency,
    status: row.is_active ? "Active" : "Inactive",
  };
  const value = values[column];
  return value == null || value === "" ? "—" : String(value);
}
