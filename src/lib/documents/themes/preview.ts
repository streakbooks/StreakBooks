import { computeTaxLineRounded } from "@/lib/sales/line-math-rounded";
import { mapSalesInvoice } from "../mappers";
import type { DocumentBranding, DocumentKind } from "../types";
import { DOCUMENT_KIND_LABEL } from "../types";
import { textToLines } from "../helpers";
import type { ThemeConfig, ThemeKind } from "./contracts";
export function previewBranding(
  base: DocumentBranding,
  c: ThemeConfig,
  logoUrl: string | null | undefined,
): DocumentBranding {
  return {
    ...base,
    layout: c,
    displayName: c.trading_name?.trim() || base.displayName,
    addressLines: c.address_text !== undefined ? textToLines(c.address_text) : base.addressLines,
    taxNumber: c.tax_number !== undefined ? c.tax_number || null : base.taxNumber,
    email: c.invoice_email !== undefined ? c.invoice_email || null : base.email,
    phone: c.invoice_phone !== undefined ? c.invoice_phone || null : base.phone,
    bankDetails: c.bank_details !== undefined ? c.bank_details || null : base.bankDetails,
    paymentInstructions:
      c.payment_instructions !== undefined
        ? c.payment_instructions || null
        : base.paymentInstructions,
    letterheadLine:
      c.letterhead_line !== undefined ? c.letterhead_line || null : base.letterheadLine,
    defaultNotes: c.default_notes !== undefined ? c.default_notes || null : base.defaultNotes,
    accentColor: c.accent_color ?? base.accentColor,
    footerText: c.footer_text ?? base.footerText,
    logoUrl: c.logo_path === null ? null : logoUrl === undefined ? base.logoUrl : logoUrl,
  };
}
export function themePreview(
  branding: DocumentBranding,
  kind: ThemeKind = "sales_invoice",
  long = false,
) {
  const lines = Array.from({ length: long ? 65 : 2 }, (_, i) => {
    const discount = i === 0 ? 1000 : 0;
    const amounts = computeTaxLineRounded({
      quantity: 2,
      unit_price_minor: 5000,
      discount_minor: discount,
      tax_rate_bps: 2000,
      treatment: "exclusive",
    });
    return {
      line_order: i,
      description: `${long ? "Detailed professional services and supporting delivery information. ".repeat(5) : "Professional services"} · Item ${i + 1}`,
      quantity: 2,
      unit_price_minor: 5000,
      discount_minor: discount,
      tax_rate_bps: 2000,
      net_minor: Number(amounts.net_minor),
      tax_minor: Number(amounts.tax_minor),
      gross_minor: Number(amounts.gross_minor),
    };
  });
  const totals = lines.reduce(
    (sum, l) => ({
      net: sum.net + l.net_minor,
      tax: sum.tax + l.tax_minor,
      gross: sum.gross + l.gross_minor,
    }),
    { net: 0, tax: 0, gross: 0 },
  );
  const doc = mapSalesInvoice(
    {
      id: "preview",
      invoice_number: "PREVIEW-001",
      invoice_date: "2026-11-01",
      due_date: "2026-12-01",
      currency_code: "GBP",
      status: "draft",
      subtotal_minor: totals.net,
      tax_minor: totals.tax,
      total_minor: totals.gross,
      amount_paid_minor: 0,
      amount_credited_minor: 0,
      memo: branding.defaultNotes,
    },
    lines,
    {
      name: "Example customer",
      billing_address_line1: "10 Sample Road",
      billing_city: "Example city",
    },
    { baseCurrency: "GBP", companyTaxNumber: branding.taxNumber },
  );
  doc.kind = kind === "customer_statement" ? "sales_invoice" : (kind as DocumentKind);
  doc.title = kind === "customer_statement" ? "Customer statement" : DOCUMENT_KIND_LABEL[doc.kind];
  doc.party.roleLabel =
    kind.startsWith("purchase_") || kind === "supplier_remittance" ? "Supplier" : "Bill to";
  if (kind === "sales_quote") {
    doc.dueDate = null;
    doc.expiryDate = "2026-12-01";
  }
  doc.mark = null;
  doc.status = "preview";
  if (kind === "sales_receipt" || kind === "supplier_remittance") {
    doc.showLines = false;
    doc.paymentAmountMinor = totals.gross;
    doc.allocations = [{ label: "Example invoice", date: "2026-11-01", amountMinor: totals.gross }];
  }
  return doc;
}
