// Deterministic browser fixtures. Production authorization and RPC tests are separate.
const scenario = () => new URLSearchParams(window.location.search);
export const useServerFn = <T>(fn: T): T => fn;
export function useActiveCompany() {
  return {
    company: {
      id: "fixture-company",
      name: "Acme Studio",
      base_currency: "GBP",
      role: "owner",
      country_code: "GB",
      permissions: ["purchases.payment", "accounts.manage"],
    },
    isPending: false,
  };
}
export function usePortal() {
  return {
    current: {
      membership_id: "fixture-membership",
      company_name: "Acme Studio",
      contact_name: "River & Co",
      currency: "GBP",
      locale: "en-GB",
      date_format: "DD/MM/YYYY",
      enabled: true,
    },
    memberships: [],
    isPending: false,
  };
}
export const supabase = { auth: { mfa: {}, getUser: async () => ({ data: { user: null } }) } };
let failed = false;
export async function listBills() {
  if (scenario().get("bills") === "error" && !failed) {
    failed = true;
    throw new Error("Bills are temporarily unavailable");
  }
  return {
    rows:
      scenario().get("bills") === "empty"
        ? []
        : [
            {
              id: "bill-one",
              contact_id: "supplier-one",
              contacts: { name: "Northfield" },
              bill_number: "BILL-100",
              supplier_invoice_number: "NF-100",
              due_date: "2026-11-04",
              currency_code: "GBP",
              total_minor: 1200,
              amount_paid_minor: 0,
              amount_credited_minor: 0,
            },
          ],
  };
}
export async function listPaymentAccounts() {
  if (scenario().get("accounts") === "error")
    throw new Error("Accounts are temporarily unavailable");
  return [
    {
      id: "bank-one",
      code: "1000",
      name: "Operating bank",
      kind: "bank",
      is_active: true,
      is_system: false,
      allow_direct_posting: true,
    },
  ];
}
export async function createBatchPayment() {
  throw new Error("Fixture prevents financial posting");
}
export async function getSupplierIntelligence() {
  return {
    contact: { id: "supplier-one", name: "Northfield", email: "north@example.test" },
    outstandingMinor: 1200,
    overdueMinor: 0,
    openBillCount: 1,
    availableCreditsMinor: 0,
    unappliedPrepaymentsMinor: 0,
    recentBills: [],
    credits: [],
    payments: [],
    openOrders: [],
    recentPayments: [],
    recentNotes: [],
  };
}
export async function getPortalInvoice() {
  const mode = scenario().get("checkout") ?? "instructions";
  return {
    invoice: {
      id: "invoice-one",
      invoice_number: "INV-100",
      invoice_date: "2026-11-04",
      due_date: "2026-11-30",
      currency_code: "GBP",
      total_minor: 1200,
      net_minor: 1000,
      tax_minor: 200,
      status: "authorised",
    },
    branding: {},
    lines: [],
    payable_minor: 1200,
    settlement_ready: scenario().get("settlement") !== "missing",
    checkout_mode: mode,
    checkout_live: scenario().get("live") === "true",
  };
}
export async function startPortalPayment() {
  throw new Error("Fixture prevents payment initiation");
}
export async function downloadPortalFile() {
  return {};
}
export async function getPortalHome() {
  return {};
}
export async function getPortalStatement() {
  return {};
}
export async function listPortalCredits() {
  return [];
}
export async function listPortalFiles() {
  return [];
}
export async function listPortalInvoices() {
  return [];
}
export async function listPortalMessages() {
  return [];
}
export async function listPortalNotifications() {
  return [];
}
export async function listPortalReceipts() {
  return [];
}
export async function postPortalMessage() {
  return {};
}
export async function uploadPortalFile() {
  return {};
}
export const RESPONSIBILITIES = ["bookkeeper", "reviewer", "relationship_manager"];
export async function listAssignableFirmMembers() {
  return [
    { user_id: "person-one", full_name: "Alex North", email: "alex@example.test" },
    { user_id: "person-two", full_name: "Maya River", email: "maya@example.test" },
  ];
}
export async function listCandidateFirmColleagues() {
  return [{ user_id: "candidate-one", full_name: "Sam Green", email: "sam@example.test" }];
}
export async function listFirmClientAssignments() {
  return [];
}
export async function addExistingFirmColleague() {
  throw new Error("Fixture prevents membership writes");
}
export async function removeFirmAssignment() {
  throw new Error("Fixture prevents membership writes");
}
export async function saveFirmAssignment() {
  throw new Error("Fixture prevents membership writes");
}

export const useCanDo = (_permission: string) => scenario().get("readonly") !== "true";
export async function getContactImportTemplate() {
  return { csv: "name,email\nExample,example@example.test" };
}
// Browser-local import response only; no contact record or remote write is made.
export async function importContactsCsv() {
  return {
    created: 1,
    skipped: 0,
    failed: 1,
    errors: [{ row: 3, message: "Email address is invalid" }],
  };
}

export function useCan() {
  return { can: useCanDo, role: "owner", ready: true };
}
