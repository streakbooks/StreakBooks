import { documentCellStyle, documentNumericValue, documentCsvValue } from "./document-format";
import ExcelJS from "exceljs";
import type { ReportDocument } from "./report-document";
import { toCsv } from "./csv";
export { exportReportPdf, bytesToBase64, base64ToBytes } from "./pdf-export.server";
export function exportReportCsv(doc: ReportDocument): string {
  return toCsv(
    {
      company: doc.company,
      report: doc.title,
      period: `${doc.from} to ${doc.to}`,
      currency: doc.currency,
      generatedAt: doc.capturedAt,
    },
    [],
    [
      [doc.subtitle],
      [doc.header],
      ...doc.sections.flatMap((s) => [
        [s.title],
        ["Account", ...s.columns],
        ...s.rows.map((r) => [
          r.label,
          ...r.values.map((v, i) => documentCsvValue(v, documentCellStyle(r, s, i))),
        ]),
        ...(s.note ? [[s.note]] : []),
        [],
      ]),
      [doc.notes],
      [doc.footer],
    ],
  );
}
export async function exportReportXlsx(doc: ReportDocument): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = doc.header || "LinkBooks";
  workbook.created = new Date(doc.capturedAt);
  doc.sections.forEach((section, index) => {
    const sheet = workbook.addWorksheet(
      `${index + 1} ${section.title}`.replace(/[\\/*?:[\]]/g, " ").slice(0, 31),
      {
        pageSetup: {
          paperSize: 9,
          orientation: doc.orientation,
          fitToPage: true,
          fitToWidth: 1,
          fitToHeight: 0,
          printTitlesRow: "1:6",
        },
      },
    );
    const p = doc.presentation;
    const primaryCompany = p?.showCompanyName === false ? "" : doc.company;
    const primaryTitle = p?.showReportTitle === false ? "" : doc.title;
    if (p?.headerOrder === "title-first") {
      sheet.addRow([primaryTitle]);
      sheet.addRow([primaryCompany]);
    } else {
      sheet.addRow([primaryCompany]);
      sheet.addRow([primaryTitle]);
    }
    const capturedAt = new Date(doc.capturedAt);
    const prepared = Number.isNaN(capturedAt.getTime()) ? "" : capturedAt.toISOString();
    sheet.addRow([
      p?.showReportPeriod === false ? "" : `${doc.from} – ${doc.to}`,
      p?.showReportPeriod === false ? "" : doc.currency,
      doc.subtitle,
      p?.showDatePrepared ? `Prepared: ${prepared.slice(0, 10)}` : "",
      p?.showTimePrepared ? `Prepared time: ${prepared.slice(11, 19)} UTC` : "",
    ]);
    sheet.addRow([doc.header]);
    if (p) {
      for (const rowIndex of [1, 2, 3, 4])
        sheet.getRow(rowIndex).alignment = { horizontal: p.headerAlignment };
      sheet.views = [{ state: "frozen", ySplit: 6, xSplit: 1, showGridLines: p.reportBorders === "all" }];
    }
    sheet.addRow([section.title]);
    sheet.addRow(["Account", ...section.columns]);
    for (const [rowIndex, row] of section.rows.entries()) {
      const data = sheet.addRow([
        row.label,
        ...row.values.map((value, i) => {
          if (value === "" || value === "Unavailable") return value;
          value = documentNumericValue(value, {
            ...documentCellStyle(row, section, i),
            decimals: value.split(".")[1]?.length ?? 0,
          });
          // Excel has 15 significant digits. Keep larger exact monetary values as text.
          if (value.replace(/[-.]/g, "").replace(/^0+/, "").length > 15) return value;
          const numeric = Number(value);
          return documentCellStyle(row, section, i).format === "percent" ? numeric / 100 : numeric;
        }),
      ]);
      if (row.kind !== "account") data.font = { bold: true };
      if (doc.presentation?.bandedRows && rowIndex % 2 === 1 && row.kind !== "heading") {
        data.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F7FA" } };
      }
      if (doc.presentation?.reportBorders === "all")
        data.eachCell((cell) => {
          cell.border = {
            top: { style: "hair", color: { argb: "FFD7DEE4" } },
            bottom: { style: "hair", color: { argb: "FFD7DEE4" } },
            left: { style: "hair", color: { argb: "FFD7DEE4" } },
            right: { style: "hair", color: { argb: "FFD7DEE4" } },
          };
        });
      data.getCell(1).alignment = { indent: row.indent ?? 0, wrapText: true };
      row.values.forEach((value, i) => {
        const cell = data.getCell(i + 2);
        const decimals =
          documentNumericValue(value, documentCellStyle(row, section, i)).split(".")[1]?.length ??
          0;
        const style = documentCellStyle(row, section, i);
        const format =
          (style.format === "percent" || style.thousands === false ? "0" : "#,##0") +
          (decimals ? "." + "0".repeat(decimals) : "") +
          (style.format === "percent" ? "%" : "");
        const prefix =
          style.format === "money" && style.currencyPrefix ? `"${style.currencyPrefix}"` : "";
        const positive = prefix + format;
        const negative =
          (style.negativeRed ? "[Red]" : "") +
          (style.negative === "minus" ? `-${positive}` : `(${positive})`);
        cell.numFmt =
          positive +
          `;${negative}` +
          (style.zero === "blank" ? ';""' : style.zero === "dash" ? ';"–"' : "");
        if (
          value !== "Unavailable" &&
          ((style.scale && style.scale !== "1") || style.decimals !== undefined) &&
          style.format !== "percent"
        )
          cell.note =
            style.decimals === undefined
              ? `Unscaled value: ${value}. Display divided by ${style.scale}.`
              : `Unscaled value: ${value}. Display divided by ${style.scale ?? "1"}; display decimals ${style.decimals}.`;
      });
    }
    if (section.note) sheet.addRow([section.note]);
    sheet.addRow([doc.notes]);
    sheet.addRow([doc.footer]);
    sheet.getColumn(1).width = 46;
    for (let i = 2; i <= section.columns.length + 1; i++) sheet.getColumn(i).width = 22;
    sheet.views = [{ state: "frozen", ySplit: 6, xSplit: 1 }];
    const footerLocation = doc.presentation?.footerAlignment === "center" ? "&C" : doc.presentation?.footerAlignment === "right" ? "&R" : "&L";
    const pageLocation = footerLocation === "&R" ? "&L" : "&R";
    sheet.headerFooter.oddFooter = footerLocation + doc.footer + pageLocation + "Page &P of &N";
  });
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
