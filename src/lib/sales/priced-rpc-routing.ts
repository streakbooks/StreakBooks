export type SalesSaveRoutingInput = {
  kind: "invoice" | "quote" | "credit_note";
  id?: string | undefined;
  quoteId?: string | null | undefined;
  hasPricing: boolean;
};

/**
 * All nonlegacy invoice/quote pricing writes must complete in the same database
 * transaction as their document save. Do not silently fall back to a legacy
 * conversion when the purpose-built provenance RPC is missing.
 */
export function salesDraftSaveRpc(input: SalesSaveRoutingInput): string {
  if (input.hasPricing) return "save_sales_document_draft_priced";
  if (input.kind === "invoice" && input.quoteId && !input.id) {
    return "save_sales_document_from_quote_priced";
  }
  return "save_sales_document_draft";
}

export function requiresAtomicPricingRpc(name: string): boolean {
  return name !== "save_sales_document_draft";
}
