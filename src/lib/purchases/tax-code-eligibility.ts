/** Same eligible record set for purchase dropdowns and registered voice adapters. */
export function isPurchaseTaxCode(code: { appliesTo?: string | undefined }): boolean {
  return !code.appliesTo || code.appliesTo === "purchases" || code.appliesTo === "both";
}
