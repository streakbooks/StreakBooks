import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";
import { standardSettingsSchema, encodeStandardSettings } from "./standard-settings";
import { standardPeriods } from "./standard-statement";
import { buildReportDocument, type ReportingFacts } from "./report-document";
import { reportingFactsFixture } from "./__fixtures__/facts";
import { exportReportCsv, exportReportPdf, exportReportXlsx } from "./document-export.server";
import { displayDocumentValue } from "./document-format";
import { parseReportSearch } from "./search";
import { validateSavedConfig } from "./saved-report";
import { reportPeriod } from "./report-periods";
import { reportHeaderParts } from "./report-presentation";
function captured(
  settings: ReturnType<typeof standardSettingsSchema.parse>,
  report: "profit-and-loss" | "balance-sheet" = "profit-and-loss",
): ReportingFacts {
  const f = reportingFactsFixture();
  const plan = standardPeriods(report, f.from, f.to, settings, 12, 31);
  f.standardColumns = plan.periods.map((p, i) => ({
    ...p,
    fyStart: "2026-01-01",
    period:
      i === 0
        ? f.period
        : f.period.map((b) => ({
            ...b,
            debit_minor: (BigInt(b.debit_minor) / 2n).toString(),
            credit_minor: (BigInt(b.credit_minor) / 2n).toString(),
          })),
    bsPrior: [],
    bsCurrent: f.bsCurrent,
  }));
  f.appliedFilters = settings.filters;
  return f;
}
const build = (s: ReturnType<typeof standardSettingsSchema.parse>, f = captured(s)) =>
  buildReportDocument(f, {
    name: "P&L",
    reportId: "profit-and-loss",
    config: { settings: encodeStandardSettings(s) },
  });
describe("standard statement controls and accounting parity", () => {
  it("persists visual settings and applies them across report document, PDF and Excel", async () => {
    const settings = standardSettingsSchema.parse({
      showCompanyName: false,
      headerOrder: "title-first",
      showReportPeriod: false,
      showDatePrepared: true,
      showTimePrepared: true,
      headerAlignment: "right",
      footerAlignment: "center",
      bandedRows: true,
      reportBorders: "all",
      footer: "Internal financial statement",
    });
    const doc = build(settings);
    expect(doc.presentation).toMatchObject({
      showCompanyName: false, headerOrder: "title-first", headerAlignment: "right",
      bandedRows: true, reportBorders: "all",
    });
    const parts = reportHeaderParts(doc).map((part) => part.text);
    expect(parts).toContain("P&L");
    expect(parts).not.toContain(doc.company);
    expect(parts.some((part) => part.startsWith("Prepared:"))).toBe(true);
    expect(parts.some((part) => part.includes("UTC"))).toBe(true);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await exportReportXlsx(doc)) as unknown as ExcelJS.Buffer);
    expect(workbook.worksheets[0]!.getCell("A1").value).toBe("P&L");
    expect(workbook.worksheets[0]!.getCell("A2").value).toBe("");
    expect(workbook.worksheets[0]!.getCell("D3").value).toContain("Prepared");
    expect(workbook.worksheets[0]!.getRow(8).fill).toBeDefined();
    expect(workbook.worksheets[0]!.headerFooter.oddFooter).toContain("&CInternal financial statement");
    expect((await PDFDocument.load(await exportReportPdf(doc))).getPageCount()).toBeGreaterThan(0);
  });

  it("keeps grouping independent from full-period comparison and computes exact amount/percent changes", () => {
    const s = standardSettingsSchema.parse({
      compare: "prior_year",
      changeAmount: true,
      changePercent: true,
      incomePercent: true,
    });
    const d = build(s),
      net = d.sections[0]!.rows.find((r) => r.label === "Net profit")!;
    expect(net.values).toEqual(["110.00", "73.33", "55.00", "73.33", "55.00", "100.00"]);
    expect(d.sections[0]!.columnFormats).toEqual([
      "money",
      "percent",
      "money",
      "percent",
      "money",
      "percent",
    ]);
    expect(d.sections[0]!.note).toContain("absolute comparison");
  });
  it("uses absolute prior amount for signed changes and explicit unavailable denominators", () => {
    const s = standardSettingsSchema.parse({
      compare: "prior_year",
      changePercent: true,
      incomePercent: true,
    });
    const f = captured(s);
    f.standardColumns![1]!.period = f.period.map((b) => ({
      ...b,
      debit_minor: b.credit_minor,
      credit_minor: b.debit_minor,
    }));
    expect(
      build(s, f)
        .sections[0]!.rows.find((r) => r.label === "Net profit")!
        .values.at(-1),
    ).toBe("200.00");
    f.standardColumns![1]!.period = [];
    const d = build(s, f);
    expect(d.sections[0]!.rows.find((r) => r.label === "Net profit")!.values.at(-1)).toBe(
      "Unavailable",
    );
    expect(exportReportCsv(d)).not.toContain("Unavailable%");
  });
  it("validates the captured periods and filters before rendering financial data", () => {
    const s = standardSettingsSchema.parse({ compare: "prior_year" });
    const f = captured(s);
    f.standardColumns![1]!.to = "2025-10-30";
    expect(() => build(s, f)).toThrow("Captured statement periods");
    const filtered = standardSettingsSchema.parse({
      filters: { clauses: [{ field: "currency", op: "eq", values: ["GBP"] }] },
    });
    const altered = captured(filtered);
    delete altered.appliedFilters;
    expect(() => build(filtered, altered)).toThrow("Captured statement filters");
  });
  it("hides account details without changing section totals and preserves zero-account choices", () => {
    const s = standardSettingsSchema.parse({ detail: "summary" });
    const d = build(s);
    expect(d.sections[0]!.rows.some((r) => r.kind === "account")).toBe(false);
    expect(d.sections[0]!.rows.find((r) => r.label === "Net profit")!.values).toEqual(["110.00"]);
    const f = captured(standardSettingsSchema.parse({ includeZero: true }));
    f.accounts.push({
      ...f.accounts[1]!,
      id: "44444444-4444-4444-8444-444444444444",
      code: "4010",
      name: "Unused income",
    });
    expect(
      build(standardSettingsSchema.parse({ includeZero: true }), f).sections[0]!.rows.some((r) =>
        r.label.includes("Unused income"),
      ),
    ).toBe(true);
    expect(
      build(standardSettingsSchema.parse({}), f).sections[0]!.rows.some((r) =>
        r.label.includes("Unused income"),
      ),
    ).toBe(false);
  });
  it("keeps exact source values while applying formatting consistently to preview and real files", async () => {
    const s = standardSettingsSchema.parse({
      compare: "prior_year",
      changeAmount: true,
      changePercent: true,
      decimals: "0",
      negativeRed: true,
      accountCodes: false,
      footer: "Reviewed locally",
    });
    const d = build(s),
      row = d.sections[0]!.rows.find((r) => r.label === "Net profit")!;
    expect(row.values[0]).toBe("110.00");
    expect(displayDocumentValue(row.values[0]!, row)).toBe("110");
    expect(exportReportCsv(d)).toContain("Reviewed locally");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await exportReportXlsx(d)) as unknown as ExcelJS.Buffer);
    const found = wb.worksheets[0]!.getRows(1, 30)!.find(
      (r) => r.getCell(1).value === "Net profit",
    )!;
    expect(found.getCell(2).value).toBe(110);
    expect(found.getCell(2).numFmt).toContain("#,##0;");
    expect(found.getCell(5).value).toBe(1);
    expect((await PDFDocument.load(await exportReportPdf(d))).getPageCount()).toBeGreaterThan(0);
  });
  it("rounds presentation without discarding the exact underlying Excel amount", async () => {
    const s = standardSettingsSchema.parse({ decimals: "0" });
    const f = captured(s);
    f.standardColumns![0]!.period[1]!.credit_minor = "15049";
    const d = build(s, f),
      wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await exportReportXlsx(d)) as unknown as ExcelJS.Buffer);
    const row = wb.worksheets[0]!.getRows(1, 30)!.find(
      (r) => r.getCell(1).value === "4000 Fixture revenue",
    )!;
    expect(row.getCell(2).value).toBe(150.49);
    expect(row.getCell(2).numFmt).toBe("#,##0;(#,##0)");
  });
  it("supports explicit expense, selected-row and asset denominators", () => {
    const expense = standardSettingsSchema.parse({ incomePercent: true, percentBasis: "expense" });
    expect(
      build(expense).sections[0]!.rows.find((r) => r.label === "6000 Fixture expense")!.values,
    ).toEqual(["40.00", "100.00"]);
    const selected = standardSettingsSchema.parse({
      incomePercent: true,
      percentBasis: "row",
      compare: "prior_year",
    });
    expect(build(selected).sections[0]!.rows.find((r) => r.label === "Net profit")!.values).toEqual(
      ["110.00", "100.00", "55.00", "50.00"],
    );
    const assets = standardSettingsSchema.parse({ incomePercent: true, percentBasis: "assets" });
    const f = captured(assets, "balance-sheet");
    const d = buildReportDocument(f, {
      name: "BS",
      reportId: "balance-sheet",
      config: { settings: encodeStandardSettings(assets) },
    });
    expect(d.sections[0]!.columns[1]).toContain("total assets");
    expect(d.sections[0]!.rows.find((r) => r.label === "Total assets")!.values).toEqual([
      "110.00",
      "100.00",
    ]);
  });
  it("collapses one account section while retaining its financial subtotal", () => {
    const s = standardSettingsSchema.parse({ collapsedSections: ["Revenue"] });
    const d = build(s);
    expect(d.sections[0]!.rows.some((r) => r.label === "4000 Fixture revenue")).toBe(false);
    expect(d.sections[0]!.rows.find((r) => r.label === "Total revenue")!.values).toEqual([
      "150.00",
    ]);
    expect(d.sections[0]!.rows.some((r) => r.label === "6000 Fixture expense")).toBe(true);
  });
  it("persists all valid controls through URL state and saved-view validation", () => {
    const s = standardSettingsSchema.parse({
      compare: "custom",
      compareFrom: "2025-01-01",
      compareTo: "2025-06-30",
      notes: "Board note",
      scale: "1000",
      compact: true,
    });
    const raw = { settings: encodeStandardSettings(s), from: "2026-10-01", to: "2026-10-31" };
    expect(parseReportSearch(raw)).toEqual(raw);
    expect(validateSavedConfig(raw)).toEqual(raw);
    expect(() => parseReportSearch({ settings: '{"compare":"custom"}' })).toThrow();
  });
  it("bounds encoded links and keeps default settings compact", () => {
    expect(encodeStandardSettings(standardSettingsSchema.parse({}))).toBe("{}");
    expect(() =>
      encodeStandardSettings(standardSettingsSchema.parse({ notes: "界".repeat(4000) })),
    ).toThrow("link size limit");
  });
  it("retains the saved report name in the shared export/attachment document", () => {
    const settings = standardSettingsSchema.parse({});
    const document = buildReportDocument(captured(settings), {
      name: "Board performance",
      reportId: "profit-and-loss",
      config: { settings: encodeStandardSettings(settings) },
    });
    expect(document.title).toBe("Board performance");
  });
  it("handles clipped monthly ranges, fiscal YTD and leap-year comparisons without silent truncation", () => {
    const s = standardSettingsSchema.parse({ group: "month", compare: "prior_ytd" });
    const p = standardPeriods("profit-and-loss", "2024-02-10", "2024-03-05", s, 3, 31);
    expect(p.periods[1]).toMatchObject({ from: "2024-02-10", to: "2024-02-29" });
    expect(p.periods.at(-1)).toMatchObject({ from: "2022-04-01", to: "2023-03-05" });
    expect(() => standardPeriods("profit-and-loss", "2020-01-01", "2024-01-01", s, 12, 31)).toThrow(
      "24 period columns",
    );
  });
  it("uses each balance-sheet date's financial-year start and disallows income-only controls", () => {
    const s = standardSettingsSchema.parse({ compare: "prior_period" });
    const p = standardPeriods("balance-sheet", "2026-04-01", "2026-11-02", s, 3, 31);
    expect(p.periods[1]).toMatchObject({ from: "2026-04-01", to: "2026-10-31" });
    expect(() =>
      standardPeriods(
        "balance-sheet",
        "2026-04-01",
        "2026-11-02",
        standardSettingsSchema.parse({ incomePercent: true }),
        3,
        31,
      ),
    ).toThrow();
  });
  it("calculates calendar and company-specific preset dates", () => {
    expect(reportPeriod("last_month", "2024-03-15")).toEqual({
      from: "2024-02-01",
      to: "2024-02-29",
    });
    expect(reportPeriod("financial_ytd", "2026-11-02", 3, 31)).toEqual({
      from: "2026-04-01",
      to: "2026-11-02",
    });
    expect(reportPeriod("last_fy", "2026-11-02", 3, 31)).toEqual({
      from: "2025-04-01",
      to: "2026-03-31",
    });
    expect(reportPeriod("last_week", "2026-11-02")).toEqual({
      from: "2026-10-26",
      to: "2026-11-01",
    });
  });
});
