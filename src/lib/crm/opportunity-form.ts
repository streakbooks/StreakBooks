/** Client-side checks complement, and never replace, CRM RPC authorization. */
export type OpportunityFormResult =
  | { valid: true; amountMinor: number; message: null }
  | { valid: false; amountMinor: null; message: string };

export function validateOpportunityForm(name: string, amountMajor: string): OpportunityFormResult {
  if (!name.trim()) {
    return { valid: false, amountMinor: null, message: "Opportunity name is required." };
  }
  const raw = amountMajor.trim();
  if (raw && !^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(raw)) {
    return {
      valid: false,
      amountMinor: null,
      message: "Amount must be non-negative and have at most two decimal places.",
    };
  }
  const [whole = "0", fraction = ""] = (raw || "0").split(".");
  const amountMinor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(amountMinor)) {
    return { valid: false, amountMinor: null, message: "Amount exceeds the supported range." };
  }
  return { valid: true, amountMinor, message: null };
}
