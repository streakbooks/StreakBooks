import type { DocumentKind } from "@/lib/documents/types";

/** Sales defaults fill gaps in document-specific branding; explicit branding wins. */
export function salesPaymentInstructionsForDocument(
  kind: DocumentKind,
  brandedInstructions: string | null | undefined,
  salesDefault: string | null | undefined,
): string | null {
  if (kind.startsWith("purchase_") || kind === "supplier_remittance") {
    return brandedInstructions?.trim() || null;
  }
  return brandedInstructions?.trim() || salesDefault?.trim() || null;
}
