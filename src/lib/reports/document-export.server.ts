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
      [doc.header],
      ...doc.sections.flatMap((s) => [
        [s.title],
        ["Account", ...s.columns],
        ...s.rows.map((r) => [
          r.label,
          ...r.values.map((v) => (r.format === "percent" && v ? v + "%" : v)),
        ]),
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
    sheet.addRow([doc.company]);
    sheet.addRow([doc.title]);
    sheet.addRow([`${doc.from} – ${doc.to}`, doc.currency]);
    sheet.addRow([doc.header]);
    sheet.addRow([section.title]);
    sheet.addRow(["Account", ...section.columns]);
    for (const row of section.rows) {
      const data = sheet.addRow([
        row.label,
        ...row.values.map((value) => {
          if (value === "") return "";
          // Excel has 15 significant digits. Keep larger exact monetary values as text.
          if (value.replace(/[-.]/g, "").replace(/^0+/, "").length > 15) return value;
          const numeric = Number(value);
          return row.format === "percent" ? numeric / 100 : numeric;
        }),
      ]);
      if (row.kind !== "account") data.font = { bold: true };
      data.getCell(1).alignment = { indent: row.indent ?? 0, wrapText: true };
      row.values.forEach((value, i) => {
        const cell = data.getCell(i + 2);
        const decimals = value.split(".")[1]?.length ?? 0;
        cell.numFmt =
          (row.format === "percent"
            ? "0" + (decimals ? "." + "0".repeat(decimals) : "") + "%"
            : "#,##0" + (decimals ? "." + "0".repeat(decimals) : "")) +
          (row.negative === "minus"
            ? ""
            : ";(#,##0" + (decimals ? "." + "0".repeat(decimals) : "") + ")");
      });
    }
    sheet.addRow([doc.notes]);
    sheet.addRow([doc.footer]);
    sheet.getColumn(1).width = 46;
    for (let i = 2; i <= section.columns.length + 1; i++) sheet.getColumn(i).width = 22;
    sheet.views = [{ state: "frozen", ySplit: 6, xSplit: 1 }];
    sheet.headerFooter.oddFooter = "&L" + doc.footer + "&RPage &P of &N";
  });
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
