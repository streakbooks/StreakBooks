import type { ReactNode } from "react";
import { themePresentation } from "@/lib/documents/themes/presentation";
import { formatDate, formatMoney } from "@/lib/format/format";
import { formatQuantity, formatRatePercent, readableTextOn } from "@/lib/documents/helpers";
import type { DocumentBranding, PrintDocument } from "@/lib/documents/types";

/**
 * Print stylesheet shared by every printable document (invoice, bill, statement ...).
 * "Save as PDF" in the browser print dialog produces the PDF; there is no server-side renderer.
 */
export const PRINT_CSS = `
.doc-sheet { font-size: var(--doc-font-size,13px); line-height: var(--doc-line-height,1.45); font-weight:var(--doc-body-weight,400); color: var(--doc-text,#111827); background: var(--doc-bg,#fff); overflow-wrap:anywhere; }
.doc-sheet table { border-collapse: collapse; width: 100%; }
.doc-sheet th, .doc-sheet td { padding: var(--doc-cell-padding,6px) 8px; vertical-align: top; }
.doc-sheet thead th { background:var(--doc-table-header,transparent);color:var(--doc-table-text,#111827);text-align: left; font-weight: 600; border-bottom: 2px solid var(--doc-accent); }
.doc-sheet tbody td { border-bottom: 1px solid #e5e7eb; }
.doc-sheet .num { text-align: right; font-variant-numeric: tabular-nums; white-space:nowrap; }
.doc-sheet thead { display: table-header-group; }
.doc-sheet tr, .doc-sheet .doc-keep { break-inside: avoid; page-break-inside: avoid; }
.doc-themed table { table-layout:fixed; }
.doc-themed .num { white-space:normal;overflow-wrap:anywhere; }
.doc-themed h1, .doc-themed h2 { color:var(--doc-heading,#111827);font-size:var(--doc-heading-size,20px);font-weight:var(--doc-heading-weight,600); }
.doc-themed .text-gray-700, .doc-themed .text-gray-600, .doc-themed .text-gray-500 { color:var(--doc-text,#111827); }
.doc-themed section.rounded { background:var(--doc-secondary,#f3f4f6); }
.doc-sheet.doc-striped tbody tr:nth-child(even) { background:var(--doc-secondary,#f3f4f6); }
.doc-sheet.doc-minimal tbody td { border-bottom:0; }
.doc-sheet .doc-long-row { break-inside:auto;page-break-inside:auto; }
@media print {
  @page { size: A4; margin: 14mm; }
  html, body { background: #fff !important; }
  .doc-sheet { -webkit-print-color-adjust: exact; print-color-adjust: exact; font-size:var(--doc-font-size,11.5px); box-shadow: none !important; border: 0 !important; padding: 0 !important; max-width: none !important; width:auto !important; }
}
`;

type Props = {
  document: PrintDocument;
  branding: DocumentBranding;
  locale: string;
  dateFormat: string | null;
  children?: ReactNode;
};

const MARK_COLOUR: Record<string, string> = {
  PAID: "#047857",
  VOID: "#b91c1c",
  DRAFT: "#6b7280",
};

export function DocumentSheet({ document: doc, branding, locale, dateFormat, children }: Props) {
  const m = (minor: number) => formatMoney(minor, doc.currency, locale);
  const d = (iso: string | null) => (iso ? formatDate(iso, locale, dateFormat) : "");
  const accent = branding.accentColor;
  const themed = Boolean(branding.layout);
  const { config: c, style, pageCss } = themePresentation(branding);
  const hasDiscount = c.show_discount && doc.lines.some((l) => l.discountMinor > 0);
  const widths = [
    ...(c.show_description ? [c.description_width] : []),
    ...(c.show_quantity ? [c.quantity_width] : []),
    ...(c.show_unit_price ? [c.unit_price_width] : []),
    ...(hasDiscount ? [c.discount_width] : []),
    ...(c.show_tax_rates ? [c.tax_width] : []),
    c.amount_width,
  ];
  const totalWidth = widths.reduce((sum, value) => sum + value, 0);
  const multiCurrency = doc.fxRateToBase !== null && doc.currency !== doc.baseCurrency;

  return (
    <article
      className={`doc-sheet ${themed ? "doc-themed" : "max-w-[820px] p-8"} doc-${c.table_style} relative mx-auto rounded-md border border-border shadow-sm`}
      style={
        themed
          ? { ...style, maxWidth: "none", boxSizing: "border-box", border: 0 }
          : ({ "--doc-accent": accent } as React.CSSProperties)
      }
      data-testid="document-sheet"
    >
      <style>{PRINT_CSS + (themed ? pageCss : "")}</style>

      {doc.mark ? (
        <div
          aria-label={`${doc.mark} document`}
          className="pointer-events-none absolute right-8 top-24 -rotate-12 rounded border-4 px-4 py-1 text-3xl font-bold tracking-widest opacity-70"
          style={{ color: MARK_COLOUR[doc.mark] ?? "#6b7280", borderColor: MARK_COLOUR[doc.mark] }}
        >
          {doc.mark}
        </div>
      ) : null}

      <header
        className={`flex items-start justify-between gap-6 ${c.header_layout === "stacked" ? "flex-col" : ""}`}
      >
        <div className={themed ? "min-w-0 flex-1 w-full" : "min-w-0"}>
          {branding.logoUrl ? (
            <img
              src={branding.logoUrl}
              alt={`${branding.displayName} logo`}
              className={`mb-2 object-contain ${themed ? "" : "max-h-16 max-w-[220px]"}`}
              style={
                themed
                  ? {
                      width: c.logo_width,
                      height: c.logo_height,
                      marginLeft: c.logo_position === "left" ? 0 : "auto",
                      marginRight: c.logo_position === "right" ? 0 : "auto",
                    }
                  : undefined
              }
            />
          ) : null}
          <p className="text-lg font-semibold">{branding.displayName}</p>
          {branding.legalName && branding.legalName !== branding.displayName ? (
            <p className="text-gray-600">{branding.legalName}</p>
          ) : null}
          {branding.letterheadLine ? <p>{branding.letterheadLine}</p> : null}
          {branding.addressLines.map((l, i) => (
            <p key={i} className="text-gray-700">
              {l}
            </p>
          ))}
          {branding.taxNumber ? (
            <p className="text-gray-700">Tax no. {branding.taxNumber}</p>
          ) : null}
          {c.show_contact_details && branding.email ? (
            <p className="text-gray-700">{branding.email}</p>
          ) : null}
          {c.show_contact_details && branding.phone ? (
            <p className="text-gray-700">{branding.phone}</p>
          ) : null}
        </div>
        <div
          className={`shrink-0 ${c.header_layout === "stacked" ? "w-full" : ""}`}
          style={{ textAlign: c.title_position }}
        >
          <h1
            className="inline-block rounded px-3 py-1 text-xl font-semibold uppercase tracking-wide"
            style={{ background: accent, color: c.heading_color ?? readableTextOn(accent) }}
          >
            {doc.title}
          </h1>
          {c.show_number && doc.number ? (
            <p className="mt-2 font-medium">No. {doc.number}</p>
          ) : null}
          {c.show_date && <p className="text-gray-700">Date {d(doc.issueDate)}</p>}
          {c.show_due_date && doc.dueDate ? (
            <p className="text-gray-700">Due {d(doc.dueDate)}</p>
          ) : null}
          {doc.expiryDate ? <p className="text-gray-700">Valid until {d(doc.expiryDate)}</p> : null}
          {doc.reference ? <p className="text-gray-700">Ref {doc.reference}</p> : null}
          {doc.extraMeta.map((e, i) => (
            <p key={i} className="text-gray-700">
              {e.label} {e.amountMinor !== undefined ? m(e.amountMinor) : (e.value ?? "")}
            </p>
          ))}
        </div>
      </header>

      {c.show_customer && (
        <section className="doc-keep mt-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {doc.party.roleLabel}
          </p>
          <p className="font-medium">{doc.party.name}</p>
          {c.show_billing_address && doc.party.addressLines.map((l, i) => <p key={i}>{l}</p>)}
          {c.show_contact_details && doc.party.email ? <p>{doc.party.email}</p> : null}
          {c.show_contact_details && doc.party.phone ? <p>{doc.party.phone}</p> : null}
          {doc.party.taxNumber ? <p>Tax no. {doc.party.taxNumber}</p> : null}
        </section>
      )}
      {c.show_shipping_address && !!doc.party.shippingAddressLines?.length && (
        <section className="doc-keep mt-4">
          <p>Ship to</p>
          {doc.party.shippingAddressLines.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </section>
      )}

      {children}
      {doc.paymentAmountMinor !== null ? (
        <section className="doc-keep mt-6 rounded border border-gray-200 p-3">
          <p className="text-xs uppercase tracking-wide text-gray-500">Amount</p>
          <p className="text-2xl font-semibold">{m(doc.paymentAmountMinor)}</p>
        </section>
      ) : null}

      {doc.showLines ? (
        <table className="mt-6">
          {themed && (
            <colgroup>
              {widths.map((width, i) => (
                <col key={i} style={{ width: `${(width / totalWidth) * 100}%` }} />
              ))}
            </colgroup>
          )}
          <thead>
            <tr>
              {c.show_description && <th>Description</th>}
              {c.show_quantity && <th className="num">Qty</th>}
              {c.show_unit_price && <th className="num">Unit price</th>}
              {hasDiscount ? <th className="num">Discount</th> : null}
              {c.show_tax_rates && <th className="num">Tax</th>}
              <th className="num">Amount</th>
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((l, i) => (
              <tr key={i} className={l.description.length > 1000 ? "doc-long-row" : undefined}>
                {c.show_description && <td className="whitespace-pre-line">{l.description}</td>}
                {c.show_quantity && <td className="num">{formatQuantity(l.quantity)}</td>}
                {c.show_unit_price && <td className="num">{m(l.unitPriceMinor)}</td>}
                {hasDiscount ? (
                  <td className="num">{l.discountMinor > 0 ? m(l.discountMinor) : "—"}</td>
                ) : null}
                {c.show_tax_rates && <td className="num">{formatRatePercent(l.taxRateBps)}</td>}
                <td className="num">{m(l.netMinor)}</td>
              </tr>
            ))}
            {doc.lines.length === 0 ? (
              <tr>
                <td
                  colSpan={
                    1 +
                    Number(c.show_description) +
                    Number(c.show_quantity) +
                    Number(c.show_unit_price) +
                    Number(hasDiscount) +
                    Number(c.show_tax_rates)
                  }
                  className="text-gray-500"
                >
                  No lines.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      ) : null}

      {doc.showLines ? (
        <div className="doc-keep mt-4 flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-[240px] flex-1">
            {c.show_tax_summary && doc.taxSummary.length > 0 ? (
              <table aria-label="Tax summary" className="max-w-[360px] text-xs">
                <thead>
                  <tr>
                    <th>Tax rate</th>
                    <th className="num">Net</th>
                    <th className="num">Tax</th>
                  </tr>
                </thead>
                <tbody>
                  {doc.taxSummary.map((t) => (
                    <tr key={t.rateBps}>
                      <td>{formatRatePercent(t.rateBps)}</td>
                      <td className="num">{m(t.netMinor)}</td>
                      <td className="num">{m(t.taxMinor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
          <div className="w-full max-w-[280px] space-y-1">
            {c.show_subtotal && <TotalRow label="Subtotal" value={m(doc.totals.subtotalMinor)} />}
            <TotalRow label="Tax" value={m(doc.totals.taxMinor)} />
            {c.show_total && (
              <TotalRow label="Total" value={m(doc.totals.totalMinor)} bold accent={accent} />
            )}
            {doc.totals.paidMinor > 0 ? (
              <TotalRow label="Paid" value={`− ${m(doc.totals.paidMinor)}`} />
            ) : null}
            {doc.totals.creditedMinor > 0 ? (
              <TotalRow label="Credited" value={`− ${m(doc.totals.creditedMinor)}`} />
            ) : null}
            {doc.totals.dueMinor !== null ? (
              <TotalRow label="Amount due" value={m(doc.totals.dueMinor)} bold accent={accent} />
            ) : null}
            {multiCurrency ? (
              <p className="pt-1 text-right text-xs text-gray-500">
                Exchange rate 1 {doc.currency} = {doc.fxRateToBase} {doc.baseCurrency}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {doc.allocations.length > 0 ? (
        <section className="mt-6">
          <h2 className="mb-1 text-sm font-semibold">{doc.allocationsTitle ?? "Applied to"}</h2>
          <table>
            <thead>
              <tr>
                <th>Document</th>
                <th>Date</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {doc.allocations.map((a, i) => (
                <tr key={i}>
                  <td>{a.label}</td>
                  <td>{d(a.date)}</td>
                  <td className="num">{m(a.amountMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {doc.paymentTermsText ? (
        <p className="doc-keep mt-5 text-gray-700">{doc.paymentTermsText}</p>
      ) : null}

      {c.show_payment_details &&
      doc.showPaymentDetails &&
      (branding.bankDetails || branding.paymentInstructions) ? (
        <section className="doc-keep mt-4 rounded border border-gray-200 p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Payment details
          </p>
          {c.show_bank_details && branding.bankDetails ? (
            <p className="whitespace-pre-line">{branding.bankDetails}</p>
          ) : null}
          {branding.paymentInstructions ? (
            <p className="mt-1 whitespace-pre-line text-gray-700">{branding.paymentInstructions}</p>
          ) : null}
        </section>
      ) : null}

      {c.show_notes && doc.notes ? (
        <section className="doc-keep mt-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Notes</p>
          <p className="whitespace-pre-line">{doc.notes}</p>
        </section>
      ) : null}

      {branding.footerText ? (
        <footer
          style={{ textAlign: c.footer_alignment }}
          className="doc-keep mt-8 border-t border-gray-200 pt-3 text-xs text-gray-600"
        >
          <p className="whitespace-pre-line">{branding.footerText}</p>
        </footer>
      ) : null}
    </article>
  );
}

function TotalRow({
  label,
  value,
  bold,
  accent,
}: {
  label: string;
  value: string;
  bold?: boolean;
  accent?: string;
}) {
  return (
    <div
      className={`flex justify-between gap-4 ${bold ? "border-t pt-1 font-semibold" : ""}`}
      style={bold && accent ? { borderColor: accent } : undefined}
    >
      <span>{label}</span>
      <span className="num">{value}</span>
    </div>
  );
}
