import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { themeConfig, normalizeTheme } from "./contracts";
import { themePresentation } from "./presentation";
import { themePreview, previewBranding } from "./preview";
import { mapBranding } from "../mappers";
import { DocumentSheet } from "@/components/documents/DocumentSheet";
const base = mapBranding(
  { name: "Base organisation", document_theme_color: "#0F766E" },
  { bank_details: "Bank account", default_notes: "Default notes" },
  null,
);
describe("document themes", () => {
  it("rejects executable CSS, unsupported fonts, out-of-range layout and forged fields", () => {
    for (const cfg of [
      { accent_color: "red;display:none" },
      { font_family: "url(https://x)" },
      { font_size: 0 },
      { margin_mm: 100 },
      { orientation: "sideways" },
      { raw_css: "body{}" },
      { show_total: "false" },
      { heading_size: 99 },
      { description_width: 90 },
    ])
      expect(themeConfig.safeParse(cfg).success).toBe(false);
  });
  it("maps page, font, table and typography through one validated presentation", () => {
    const config = normalizeTheme({
      page_size: "Letter",
      orientation: "landscape",
      margin_mm: 18,
      font_family: "serif",
      font_size: 16,
      heading_weight: "700",
      table_header_color: "#F0F0F0",
    });
    const rendered = themePresentation({ ...base, layout: config });
    expect(rendered.pageCss).toContain("size: Letter landscape; margin: 18mm");
    expect(rendered.style.fontFamily).toContain("Georgia");
    expect(rendered.style.width).toBe("279.4mm");
    expect(rendered.style).toMatchObject({
      "--doc-font-size": "16px",
      "--doc-heading-weight": "700",
      "--doc-table-text": "#000000",
    });
  });
  it("hides print columns without changing source totals or line values", () => {
    const config = normalizeTheme({
      show_quantity: false,
      show_unit_price: false,
      show_tax_rates: false,
      show_tax_summary: false,
      show_bank_details: false,
      show_subtotal: false,
      show_total: false,
      heading_color: "#224466",
      show_notes: false,
    });
    const branding = previewBranding(base, config, undefined);
    const doc = themePreview(branding);
    const before = JSON.stringify(doc);
    const html = renderToStaticMarkup(
      createElement(DocumentSheet, { document: doc, branding, locale: "en-GB", dateFormat: null }),
    );
    expect(html).not.toContain(">Qty<");
    expect(html).not.toContain(">Unit price<");
    expect(html).not.toContain('aria-label="Tax summary"');
    expect(html).not.toContain(">Subtotal<");
    expect(html).not.toContain(">Total<");
    expect(html).not.toContain("Bank account");
    expect(JSON.stringify(doc)).toBe(before);
    expect(doc.totals.totalMinor).toBe(22800);
  });
  it("safely renders arbitrary branding text and preserves live preview inheritance", () => {
    const config = normalizeTheme({
      trading_name: "<script>alert(1)</script>",
      address_text: "Line 1\nLine 2",
      logo_path: null,
      footer_text: "Footer",
    });
    const branding = previewBranding(base, config, "https://example.test/old.png");
    expect(branding.logoUrl).toBeNull();
    expect(branding.addressLines).toEqual(["Line 1", "Line 2"]);
    const html = renderToStaticMarkup(
      createElement(DocumentSheet, {
        document: themePreview(branding),
        branding,
        locale: "en-GB",
        dateFormat: null,
      }),
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
  it("renders tax and payment-term labels exactly once", () => {
    const html = renderToStaticMarkup(
      createElement(DocumentSheet, {
        document: themePreview(base),
        branding: base,
        locale: "en-GB",
        dateFormat: null,
      }),
    );
    expect(html).toContain("20%");
    expect(html).not.toContain("20%%");
    expect(html).not.toMatch(/Payment terms:.*Payment terms:/);
  });
  it("retains older organisation branding when no theme is selected", () => {
    expect(base.layout).toBeUndefined();
    expect(themePresentation(base).config.page_size).toBe("A4");
    expect(base.bankDetails).toBe("Bank account");
    expect(base.defaultNotes).toBe("Default notes");
  });
});
