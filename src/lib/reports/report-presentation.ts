import type { ReportDocument } from "./report-document";

export type ReportHeaderPart = { text: string; title: boolean };

export function reportHeaderParts(doc: ReportDocument): ReportHeaderPart[] {
  const p = doc.presentation;
  if (!p) {
    return [
      doc.header,
      doc.company,
      doc.title,
      doc.subtitle,
      `${doc.from} – ${doc.to} · ${doc.currency}`,
    ]
      .filter(Boolean)
      .map((text) => ({ text, title: text === doc.title }));
  }
  const primary = [
    ...(p.showCompanyName ? [{ text: doc.company, title: false }] : []),
    ...(p.showReportTitle ? [{ text: doc.title, title: true }] : []),
  ];
  if (p.headerOrder === "title-first") primary.reverse();
  const parts: ReportHeaderPart[] = [
    ...(doc.header ? [{ text: doc.header, title: false }] : []),
    ...primary,
    ...(doc.subtitle ? [{ text: doc.subtitle, title: false }] : []),
    ...(p.showReportPeriod
      ? [{ text: `${doc.from} – ${doc.to} · ${doc.currency}`, title: false }]
      : []),
  ];
  const parsed = new Date(doc.capturedAt);
  if (!Number.isNaN(parsed.getTime())) {
    const stamp = parsed.toISOString();
    if (p.showDatePrepared) parts.push({ text: `Prepared: ${stamp.slice(0, 10)}`, title: false });
    if (p.showTimePrepared)
      parts.push({ text: `Prepared time: ${stamp.slice(11, 19)} UTC`, title: false });
  }
  return parts;
}

export function reportAlignment(value: "left" | "center" | "right" | undefined) {
  return value ?? "left";
}
