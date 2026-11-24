import { PDFDocument, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { reportFontBase64 } from "./report-font.server";
import { displayDocumentValue, documentCellStyle } from "./document-format";
import type { ReportDocument } from "./report-document";
import { reportHeaderParts } from "./report-presentation";
export function bytesToBase64(bytes: Uint8Array): string {
  let text = "";
  for (let start = 0; start < bytes.length; start += 8192)
    text += String.fromCharCode(...bytes.subarray(start, start + 8192));
  return btoa(text);
}
export function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      if (font.widthOfTextAtSize(line + (line ? " " : "") + word, size) <= width)
        line += (line ? " " : "") + word;
      else {
        if (line) lines.push(line);
        line = "";
        for (const char of word) {
          if (font.widthOfTextAtSize(line + char, size) > width) {
            lines.push(line);
            line = char;
          } else line += char;
        }
      }
    }
    lines.push(line);
  }
  return lines;
}
/** Every export consumes exactly the same document rows rendered by the preview. */
export async function exportReportPdf(doc: ReportDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(base64ToBytes(reportFontBase64), { subset: true });
  pdf.setTitle(doc.title);
  pdf.setAuthor(doc.header || "StreakBooks");
  pdf.setSubject(`${doc.company}: ${doc.from} – ${doc.to}`);
  const landscape = doc.orientation === "landscape";
  const size: [number, number] = landscape ? [842, 595] : [595, 842];
  const margin = 36;
  let page = pdf.addPage(size),
    y = size[1] - margin;
  const ink = rgb(0.12, 0.17, 0.2),
    muted = rgb(0.38, 0.43, 0.47),
    line = rgb(0.83, 0.86, 0.88);
  const text = (s: string, x: number, yy: number, fs = 9, color = ink) =>
    page.drawText(s, { x, y: yy, size: fs, font, color });
  function header() {
    y = size[1] - margin;
    for (const part of reportHeaderParts(doc)) {
      const fs = part.title ? 16 : 9;
      for (const lineText of wrap(part.text, font, fs, size[0] - margin * 2)) {
        const width = font.widthOfTextAtSize(lineText, fs);
        const alignment = doc.presentation?.headerAlignment ?? "left";
        const x =
          alignment === "center"
            ? (size[0] - width) / 2
            : alignment === "right"
              ? size[0] - margin - width
              : margin;
        text(lineText, x, y, fs);
        y -= part.title ? 21 : 13;
      }
    }
    y -= 8;
  }
  function nextPage() {
    page = pdf.addPage(size);
    header();
  }
  header();
  for (const section of doc.sections) {
    // Wide custom reports paginate horizontally with the row label repeated in each panel.
    for (let start = 0; start < Math.max(1, section.columns.length); start += 6) {
      const columns = section.columns.slice(start, start + 6),
        contentWidth = size[0] - margin * 2,
        labelWidth = columns.length ? contentWidth * 0.38 : contentWidth,
        valueWidth = (contentWidth - labelWidth) / Math.max(1, columns.length);
      function tableHeader() {
        if (y < 120) nextPage();
        text(
          section.title +
            (section.columns.length > 6 ? ` (columns ${start + 1}–${start + columns.length})` : ""),
          margin,
          y,
          12,
        );
        y -= 19;
        let max = 1;
        const labelHeading = wrap(
          section.labelHeader ?? "Account / measure",
          font,
          8,
          labelWidth - 8,
        );
        max = Math.max(max, labelHeading.length);
        labelHeading.forEach((l, j) => text(l, margin + 2, y - j * 10, 8));
        columns.forEach((c, i) => {
          const ls = wrap(c, font, 8, valueWidth - 8);
          max = Math.max(max, ls.length);
          ls.forEach((l, j) => text(l, margin + labelWidth + i * valueWidth + 4, y - j * 10, 8));
        });
        y -= max * 10 + 6;
        if (doc.presentation?.reportBorders !== "none")
          page.drawLine({
            start: { x: margin, y },
            end: { x: size[0] - margin, y },
            thickness: 1,
            color: line,
          });
        y -= 14;
      }
      tableHeader();
      for (const [rowIndex, row] of section.rows.entries()) {
        const labels = wrap(row.label, font, 9, labelWidth - 12 - (row.indent ?? 0) * 8);
        const displayCells = row.values.slice(start, start + 6).map((value, i) => {
          const rendered = displayDocumentValue(value, documentCellStyle(row, section, start + i));
          const isNumber = /^-?\\d+(?:\\.\\d+)?$/.test(value);
          const lines = isNumber ? [rendered] : wrap(rendered, font, 8, valueWidth - 8);
          if (isNumber && font.widthOfTextAtSize(rendered, 8) > valueWidth - 8)
            throw new Error(
              "A financial amount exceeds the column width; use fewer columns or landscape pages",
            );
          return { lines, negative: row.negativeRed && value.startsWith("-") };
        });
        const height =
          Math.max(1, labels.length, ...displayCells.map((cell) => cell.lines.length)) * 12 + 8;
        if (height > size[1] - 250)
          throw new Error("A report row is too long for the selected page size");
        if (y - height < margin + 35) {
          nextPage();
          tableHeader();
        }
        if (row.kind === "heading" || (doc.presentation?.bandedRows && rowIndex % 2 === 1))
          page.drawRectangle({
            x: margin,
            y: y - height + 8,
            width: contentWidth,
            height,
            color: row.kind === "heading" ? rgb(0.94, 0.96, 0.96) : rgb(0.975, 0.98, 0.99),
          });
        labels.forEach((l, i) => text(l, margin + (row.indent ?? 0) * 8, y - i * 12, 9));
        displayCells.forEach((cell, i) => {
          cell.lines.forEach((lineText, j) => {
            const w = font.widthOfTextAtSize(lineText, 8);
            text(
              lineText,
              margin + labelWidth + (i + 1) * valueWidth - w - 4,
              y - j * 12,
              8,
              cell.negative ? rgb(0.7, 0.1, 0.1) : ink,
            );
          });
        });
        y -= height;
        if (doc.presentation?.reportBorders === "all") {
          page.drawLine({
            start: { x: margin, y: y + 8 },
            end: { x: size[0] - margin, y: y + 8 },
            thickness: 0.3,
            color: line,
          });
          for (let columnIndex = 0; columnIndex <= columns.length; columnIndex++) {
            const x = margin + labelWidth + columnIndex * valueWidth;
            page.drawLine({
              start: { x, y: y + 8 },
              end: { x, y: y + height + 8 },
              thickness: 0.3,
              color: line,
            });
          }
        }
        if (
          doc.presentation?.reportBorders !== "none" &&
          ["subtotal", "total", "group"].includes(row.kind)
        )
          page.drawLine({
            start: { x: margin, y: y + 8 },
            end: { x: size[0] - margin, y: y + 8 },
            thickness: 0.5,
            color: line,
          });
      }
      if (section.note)
        for (const l of wrap(section.note, font, 8, contentWidth)) {
          if (y < 70) nextPage();
          text(l, margin, y, 8);
          y -= 11;
        }
      y -= 20;
    }
  }
  if (doc.notes) {
    if (y < 100) nextPage();
    text("Management commentary", margin, y, 11);
    y -= 17;
    for (const l of wrap(doc.notes, font, 9, size[0] - margin * 2)) {
      if (y < 70) nextPage();
      text(l, margin, y, 9);
      y -= 12;
    }
  }
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    const foot = `${doc.footer || "StreakBooks"}  •  Page ${i + 1} of ${pages.length}`;
    const footerWidth = font.widthOfTextAtSize(foot, 7);
    const footerAlign = doc.presentation?.footerAlignment ?? "left";
    const footerX =
      footerAlign === "center"
        ? (size[0] - footerWidth) / 2
        : footerAlign === "right"
          ? size[0] - margin - footerWidth
          : margin;
    p.drawText(foot, { x: footerX, y: 22, font, size: 7, color: muted });
    p.drawText(`Snapshot: ${doc.capturedAt}`, { x: margin, y: 12, font, size: 6, color: muted });
  });
  return pdf.save();
}
