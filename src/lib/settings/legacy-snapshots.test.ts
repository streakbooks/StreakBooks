import { describe, expect, it } from "vitest";
import { brandingSnapshot, localisationSnapshot, sequenceSnapshot } from "./legacy-snapshots";

describe("legacy settings compare-and-save snapshots", () => {
  it("does not compare unrelated company fields", () => {
    const input = {
      locale: "en-US",
      date_format: "MM/DD/YYYY",
      invoice_footer: "Invoice footer",
      document_theme_color: "#0F766E",
      base_currency: "USD",
      is_demo: false,
    };
    expect(localisationSnapshot(input)).toEqual({
      locale: "en-US",
      date_format: "MM/DD/YYYY",
      invoice_footer: "Invoice footer",
      document_theme_color: "#0F766E",
    });
  });

  it("preserves null for branding not yet configured", () => {
    const fetchedBranding = {
      trading_name: null,
      letterhead_line: null,
      invoice_email: null,
      invoice_phone: null,
      logo_url: null,
      updated_at: "2026-11-04T00:00:00Z",
    };
    expect(brandingSnapshot(fetchedBranding)).toEqual({
      trading_name: null,
      letterhead_line: null,
      invoice_email: null,
      invoice_phone: null,
      logo_url: null,
    });
  });

  it("compares the exact sequence state without a document-type field", () => {
    const fetchedSequence = { document_type: "sales_invoice", prefix: "INV-", next_number: 22, padding: 4 };
    expect(sequenceSnapshot(fetchedSequence)).toEqual({
      prefix: "INV-",
      next_number: 22,
      padding: 4,
    });
  });
});
