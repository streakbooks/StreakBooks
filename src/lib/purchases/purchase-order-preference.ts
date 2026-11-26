/** Guidance only: independent bills remain valid when this preference is enabled. */
export function purchaseOrderPreferenceNotice(enabled: boolean): string | null {
  if (!enabled) return null;
  return "Organisation policy prefers a purchase order before bills. Link a PO from Orders when converting, or continue if this bill is independent.";
}
