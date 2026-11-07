/**
 * Versioned public API scopes for third-party developers.
 * Partners never receive service-role or unrestricted database access.
 */

export const PUBLIC_API_VERSION = "v1" as const;

export type PublicApiScopeDefinition = {
  key: string;
  label: string;
  description: string;
  module: string;
  access: "read" | "write";
};

export const PUBLIC_API_SCOPES: readonly PublicApiScopeDefinition[] = [
  {
    key: "organisation.read",
    label: "Read organisation profile",
    description: "Read basic organisation identity and locale settings.",
    module: "settings",
    access: "read",
  },
  {
    key: "contacts.read",
    label: "Read contacts",
    description: "List and fetch customers and suppliers.",
    module: "contacts",
    access: "read",
  },
  {
    key: "contacts.write",
    label: "Write contacts",
    description: "Create or update contacts with organisation authorization.",
    module: "contacts",
    access: "write",
  },
  {
    key: "products.read",
    label: "Read products",
    description: "List products and services.",
    module: "products",
    access: "read",
  },
  {
    key: "products.write",
    label: "Write products",
    description: "Create or update products and services.",
    module: "products",
    access: "write",
  },
  {
    key: "sales.read",
    label: "Read sales",
    description: "Read invoices, credit notes and sales documents.",
    module: "sales",
    access: "read",
  },
  {
    key: "sales.write",
    label: "Write sales",
    description: "Create draft sales documents through approved posting paths.",
    module: "sales",
    access: "write",
  },
  {
    key: "purchases.read",
    label: "Read purchases",
    description: "Read bills and purchase documents.",
    module: "purchases",
    access: "read",
  },
  {
    key: "purchases.write",
    label: "Write purchases",
    description: "Create draft purchase documents through approved paths.",
    module: "purchases",
    access: "write",
  },
  {
    key: "banking.read",
    label: "Read banking",
    description: "Read bank accounts and transaction summaries.",
    module: "banking",
    access: "read",
  },
  {
    key: "accounting.read",
    label: "Read accounting",
    description: "Read chart of accounts and posted journal summaries.",
    module: "accounting",
    access: "read",
  },
  {
    key: "files.write",
    label: "Upload files",
    description: "Attach documents to authorised records.",
    module: "files",
    access: "write",
  },
  {
    key: "webhooks.manage",
    label: "Manage webhooks",
    description: "Register and rotate webhook endpoints for the application.",
    module: "platform",
    access: "write",
  },
] as const;

export function publicApiScopeByKey(key: string): PublicApiScopeDefinition | undefined {
  return PUBLIC_API_SCOPES.find((s) => s.key === key);
}
