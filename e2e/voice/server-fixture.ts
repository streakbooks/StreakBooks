type Call = { name: string; data: Record<string, unknown> };
declare global {
  interface Window {
    voiceServer: { calls: Call[]; failSave: boolean; failAudit: boolean };
  }
}
window.voiceServer = { calls: [], failSave: false, failAudit: false };
export const defaults = {
  sidebarState: "expanded",
  sidebarWidthPx: 320,
  sidebarTab: "summary",
  viewMode: "professional",
};
const contacts = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    name: "ABC Limited",
    payment_terms_days: 30,
    is_active: true,
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    name: "ABC Services",
    payment_terms_days: 30,
    is_active: true,
  },
];
const accounts = [
  {
    id: "00000000-0000-4000-8000-000000000011",
    code: "4000",
    name: "Consulting income",
    account_type: "income",
    is_postable: true,
    is_active: true,
  },
  {
    id: "00000000-0000-4000-8000-000000000012",
    code: "5000",
    name: "Consulting expense",
    account_type: "expense",
    is_postable: true,
    is_active: true,
  },
];
const tax = {
  id: "00000000-0000-4000-8000-000000000021",
  code: "ZERO",
  name: "Zero rate",
  rate_bps: 0,
  applies_to: "both",
  is_active: true,
  tax_rates: { rate_bps: 0 },
};
export async function call(name: string, args: unknown[]) {
  const data = (args[0] as { data?: Record<string, unknown> } | undefined)?.data ?? {};
  window.voiceServer.calls.push({ name, data });
  if (["listCustomers", "listSuppliers"].includes(name)) return contacts;
  if (name === "listAccounts") return accounts;
  if (name === "listTaxCodes")
    return [
      tax,
      {
        ...tax,
        id: "00000000-0000-4000-8000-000000000022",
        code: "SALES",
        name: "Sales only",
        applies_to: "sales",
      },
    ];
  if (name === "getSalesDocumentConfig")
    return {
      baseCurrency: "GBP",
      today: "2026-10-31",
      timezone: "UTC",
      treatment: "exclusive",
      taxCodes: [tax],
    };
  if (name === "getWorkflowSettings")
    return { sales_default_payment_terms_days: 30, purchases_default_payment_terms_days: 30 };
  if (name === "getOrgExtendedSettings") return { enabledCurrencies: ["GBP", "USD"], settings: {} };
  if (name === "getBillWorkspacePrefs") return defaults;
  if (name === "listTrackingDimensions") return { categories: [], options: [] };
  if (name === "checkDuplicateSupplierBill") return { duplicate: false };
  if (name === "resolveFxRateForBill") return { rate: 1, source: "base" };
  if (name === "recordVoiceDraftOutcome") {
    if (window.voiceServer.failAudit) throw new Error("Fixture audit unavailable");
    return { recorded: true };
  }
  if (
    ["saveInvoiceDraft", "saveQuoteDraft", "saveCreditNoteDraft", "saveBillDraft"].includes(name)
  ) {
    if (window.voiceServer.failSave) throw new Error("Fixture save response lost");
    return { id: "00000000-0000-4000-8000-000000000099", invoiceNumber: "INV-TEST" };
  }
  if (name.startsWith("list")) return [];
  throw new Error(`Unexpected fixture API: ${name}`);
}
