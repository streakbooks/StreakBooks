import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import ExcelJS from "exceljs";
import { buildReportDocument, PACK_REPORTS } from "./report-document";
import { exportReportPdf, exportReportXlsx, exportReportCsv } from "./document-export.server";
import { reportingFactsFixture } from "./__fixtures__/facts";
import { displayDocumentValue } from "./document-format";

describe("financial report documents and real export files", () => {
  it("reuses the accounting engine and preserves selected report ordering", () => {
    const doc = buildReportDocument(reportingFactsFixture(), {
      name: "Management pack",
      config: { reports: [...PACK_REPORTS] },
    });
    expect(doc.sections.map((s) => s.id)).toEqual([...PACK_REPORTS]);
    const pnl = doc.sections[0]!;
    expect(pnl.rows.find((r) => r.label === "Net profit")?.values[0]).toBe("110.00");
    const cash = doc.sections.find((s) => s.id === "cash-summary")!;
    expect(cash.rows[0]!.values).toEqual(["0.00", "150.00", "40.00", "0.00", "110.00"]);
    const indirect = doc.sections.at(-1)!;
    expect(indirect.rows.at(-1)!.values).toEqual(["110.00"]);
  });
  it("does not silently export unreconciled cash or balance sheets", () => {
    const facts = reportingFactsFixture();
    facts.cash[0]!.closing_minor = "9999";
    expect(() =>
      buildReportDocument(facts, { name: "Bad cash", reportId: "cash-flow-indirect", config: {} }),
    ).toThrow("reconcile");
    facts.bsCurrent[0]!.debit_minor = "15999";
    expect(() =>
      buildReportDocument(facts, { name: "Bad BS", reportId: "balance-sheet", config: {} }),
    ).toThrow("reconcile");
  });
  it("creates a readable multipage Unicode PDF with title and repeated report sections", async () => {
    const doc = buildReportDocument(reportingFactsFixture(), {
      name: "Résumé — Financial review",
      config: { reports: [...PACK_REPORTS], commentary: "Reviewed actual ledger records." },
    });
    const pdf = await PDFDocument.load(await exportReportPdf(doc));
    expect(pdf.getTitle()).toBe(doc.title);
    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });
  it("creates a usable Excel workbook whose values match the document exactly", async () => {
    const doc = buildReportDocument(reportingFactsFixture(), {
      name: "Export fixture",
      config: { reports: ["cash-summary", "profit-and-loss"] },
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await exportReportXlsx(doc)) as unknown as ExcelJS.Buffer);
    expect(workbook.worksheets.length).toBe(2);
    expect(workbook.worksheets[0]!.getCell("F7").value).toBe(110);
    for (const [i, section] of doc.sections.entries())
      for (const [j, row] of section.rows.entries())
        for (const [k, value] of row.values.entries())
          expect(workbook.worksheets[i]!.getCell(j + 7, k + 2).value).toBe(
            value === "" ? "" : Number(value),
          );
  });
  it("exports CSV headers, period and financial values with formula injection protection", () => {
    const doc = buildReportDocument(reportingFactsFixture(), {
      name: "CSV review",
      config: { reports: ["cash-summary"] },
    });
    doc.sections[0]!.rows[0]!.label = '=HYPERLINK("malicious")';
    const csv = exportReportCsv(doc);
    expect(csv).toContain('"Closing cash"');
    expect(csv).toContain('"110.00"');
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("2026-10-01 to 2026-10-31");
  });
  it("retains approved commentary, action items and branding in all document exports", async () => {
    const doc = buildReportDocument(reportingFactsFixture(), {
      name: "Actions",
      config: {
        reports: ["cash-summary"],
        header: "Review header",
        footer: "Review footer",
        commentary: "Review commentary",
        actionItems: [{ text: "Review debtor follow-up", status: "in_progress", assigneeId: null }],
      },
    });
    expect(doc.notes).toContain("Review debtor follow-up — in progress");
    const csv = exportReportCsv(doc);
    for (const text of [doc.header, doc.footer, doc.notes]) expect(csv).toContain(text);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await exportReportXlsx(doc)) as unknown as ExcelJS.Buffer);
    expect(workbook.worksheets[0]!.getSheetValues().flat().join(" ")).toContain(doc.notes);
  });
  it("formats negatives, percentages and large values without floating-point conversion", () => {
    expect(displayDocumentValue("-100.25", { negative: "parentheses", format: "money" })).toBe(
      "(100.25)",
    );
    expect(displayDocumentValue("123456789012345678.90", { format: "money" })).toBe(
      "123,456,789,012,345,678.90",
    );
    expect(displayDocumentValue("73.33", { format: "percent" })).toBe("73.33%");
  });
});
