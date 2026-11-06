import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatMinorAmount } from "@/lib/billing/domain/money";
import { base64ToBytes } from "@/lib/reports/pdf-export.server";
import { reportFontBase64 } from "@/lib/reports/report-font.server";

type Party = {
  name?: string;
  legalName?: string;
  tradingName?: string | null;
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
  email?: string | null;
  supportEmail?: string | null;
  taxIdScheme?: string | null;
  taxId?: string | null;
  registrations?: Array<{ scheme?: string; number?: string; region?: string }>;
};

export type BillingDocument = {
  kind: "invoice" | "credit_note";
  number: string;
  invoiceNumber: string;
  issuedAt: string;
  seller: Party;
  customer: Party;
  currency: string;
  tax: {
    label?: string | null;
    rateBps?: number | null;
    mode?: string | null;
    treatment?: string | null;
    note?: string | null;
  };
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  reason?: string | null;
  discountMinor?: number;
  offerCode?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  lines: Array<{
    description: string;
    quantity: number;
    netMinor: number;
    taxMinor: number;
    totalMinor: number;
  }>;
};

function date(value: string | null | undefined): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function addressLines(party: Party): string[] {
  return [
    party.line1,
    party.line2,
    [party.city, party.region, party.postalCode].filter(Boolean).join(", "),
    party.country,
  ].filter((line): line is string => Boolean(line && line.trim()));
}

/**
 * Renders an issued invoice or credit note from its stored snapshot. Wording about tax treatment
 * comes only from the approved rule's invoice note.
 */
export async function renderBillingDocumentPdf(doc: BillingDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(base64ToBytes(reportFontBase64), { subset: true });
  const title = doc.kind === "invoice" ? "Tax invoice" : "Credit note";
  pdf.setTitle(`${title} ${doc.number}`);
  pdf.setAuthor(doc.seller.legalName ?? "LinkBooks");
  const page = pdf.addPage([595, 842]);
  const ink = rgb(0.12, 0.17, 0.2);
  const muted = rgb(0.38, 0.43, 0.47);
  const margin = 48;
  let y = 842 - margin;
  const text = (
    value: string,
    x: number,
    size = 9,
    color = ink,
    target: PDFPage = page,
    f: PDFFont = font,
  ) => target.drawText(value, { x, y, size, font: f, color });
  const money = (minor: number) => formatMinorAmount(BigInt(minor), doc.currency);
  const right = (value: string, xRight: number, size = 9) =>
    text(value, xRight - font.widthOfTextAtSize(value, size), size);

  text(doc.seller.legalName ?? "", margin, 14);
  right(title, 595 - margin, 16);
  y -= 16;
  for (const line of [
    ...(doc.seller.tradingName ? [doc.seller.tradingName] : []),
    ...addressLines(doc.seller),
    ...(doc.seller.registrations ?? []).map((reg) =>
      `${reg.scheme ?? ""} ${reg.number ?? ""}${reg.region ? ` (${reg.region})` : ""}`.trim(),
    ),
    ...(doc.seller.supportEmail ? [doc.seller.supportEmail] : []),
  ]) {
    text(line, margin, 9, muted);
    y -= 12;
  }

  y -= 10;
  const facts: Array<[string, string]> = [
    [doc.kind === "invoice" ? "Invoice number" : "Credit note number", doc.number],
    ["Date", date(doc.issuedAt)],
    ...(doc.kind === "credit_note"
      ? ([["Against invoice", doc.invoiceNumber]] as Array<[string, string]>)
      : []),
    ...(doc.periodStart
      ? ([["Service period", `${date(doc.periodStart)} – ${date(doc.periodEnd)}`]] as Array<
          [string, string]
        >)
      : []),
  ];
  for (const [label, value] of facts) {
    text(label, margin, 9, muted);
    text(value, margin + 120, 9);
    y -= 13;
  }

  y -= 10;
  text("Billed to", margin, 9, muted);
  y -= 13;
  for (const line of [
    doc.customer.name ?? "",
    ...addressLines(doc.customer),
    ...(doc.customer.taxId
      ? [`${doc.customer.taxIdScheme ?? "Tax ID"} ${doc.customer.taxId}`]
      : []),
    ...(doc.customer.email ? [doc.customer.email] : []),
  ].filter(Boolean)) {
    text(line, margin, 9);
    y -= 12;
  }

  y -= 16;
  const taxLabel = doc.tax.label ?? "Tax";
  const columns = { description: margin, net: 360, tax: 445, total: 595 - margin };
  text("Description", columns.description, 9, muted);
  right("Net", columns.net);
  right(taxLabel, columns.tax);
  right("Amount", columns.total);
  y -= 6;
  page.drawLine({
    start: { x: margin, y },
    end: { x: 595 - margin, y },
    thickness: 0.5,
    color: muted,
  });
  y -= 14;
  for (const line of doc.lines) {
    text(line.description, columns.description);
    right(money(line.netMinor), columns.net);
    right(money(line.taxMinor), columns.tax);
    right(money(line.totalMinor), columns.total);
    y -= 14;
  }
  page.drawLine({
    start: { x: 330, y: y + 4 },
    end: { x: 595 - margin, y: y + 4 },
    thickness: 0.5,
    color: muted,
  });
  y -= 6;
  const rate =
    doc.tax.rateBps != null && doc.tax.treatment === "standard"
      ? ` (${(doc.tax.rateBps / 100).toFixed(2)}%)`
      : "";
  const discountRows: Array<[string, string, number]> =
    doc.discountMinor && doc.discountMinor > 0
      ? [
          [
            `Discount${doc.offerCode ? ` (${doc.offerCode})` : ""}`,
            `−${money(doc.discountMinor)}`,
            9,
          ],
        ]
      : [];
  for (const [label, value, size] of [
    ...discountRows,
    ["Subtotal", money(doc.subtotalMinor), 9],
    [`${taxLabel}${rate}`, money(doc.taxMinor), 9],
    [doc.kind === "invoice" ? "Total paid" : "Total credited", money(doc.totalMinor), 11],
  ] as Array<[string, string, number]>) {
    text(label, 360, size);
    right(value, columns.total, size);
    y -= size + 6;
  }

  y -= 10;
  if (doc.kind === "credit_note" && doc.reason) {
    text(`Reason: ${doc.reason}`, margin, 9, muted);
    y -= 13;
  }
  if (doc.tax.note) {
    text(doc.tax.note, margin, 9, muted);
    y -= 13;
  }
  return pdf.save();
}
