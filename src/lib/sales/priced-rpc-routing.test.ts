import { describe, expect, it } from "vitest";
import { requiresAtomicPricingRpc, salesDraftSaveRpc } from "./priced-rpc-routing";

describe("sales pricing source save routes", () => {
  it("uses priced atomic save for invoice and quote editor drafts", () => {
    for (const kind of ["invoice", "quote"] as const) {
      expect(salesDraftSaveRpc({ kind, hasPricing: true })).toBe(
        "save_sales_document_draft_priced",
      );
      expect(salesDraftSaveRpc({ kind, id: "existing", hasPricing: true })).toBe(
        "save_sales_document_draft_priced",
      );
    }
  });
  it("preserves quote origin and compatible pricing snapshots atomically on conversion", () => {
    expect(salesDraftSaveRpc({ kind: "invoice", quoteId: "source", hasPricing: false })).toBe(
      "save_sales_document_from_quote_priced",
    );
    expect(
      salesDraftSaveRpc({
        kind: "invoice",
        id: "already-created",
        quoteId: "source",
        hasPricing: false,
      }),
    ).toBe("save_sales_document_draft");
  });
  it("keeps legacy invoices and credit notes on the existing accounting save path", () => {
    expect(salesDraftSaveRpc({ kind: "invoice", hasPricing: false })).toBe(
      "save_sales_document_draft",
    );
    expect(salesDraftSaveRpc({ kind: "credit_note", hasPricing: false })).toBe(
      "save_sales_document_draft",
    );
  });
  it("never treats unavailable priced RPCs as safe to fall back", () => {
    expect(requiresAtomicPricingRpc("save_sales_document_draft_priced")).toBe(true);
    expect(requiresAtomicPricingRpc("save_sales_document_from_quote_priced")).toBe(true);
    expect(requiresAtomicPricingRpc("save_sales_document_draft")).toBe(false);
  });
});
