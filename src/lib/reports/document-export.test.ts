import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import ExcelJS from "exceljs";
import { buildReportDocument, PACK_REPORTS } from "./report-document";
import { exportReportPdf, exportReportXlsx, exportReportCsv } from "./document-export.server";
import { reportingFactsFixture } from "./__fixtures__/facts";
import { starterDefinition, customDefinitionSchema } from "./custom-definition";
import { reportFiltersSchema } from "./report-filters";
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
  it("rejects missing or mismatched filter provenance and labels filtered exports", async () => {
    const facts = reportingFactsFixture();
    const definition = starterDefinition();
    definition.filters = reportFiltersSchema.parse({
      clauses: [{ field: "account_type", op: "eq", values: ["income"] }],
    });
    facts.customColumns = [
      {
        id: "current",
        from: facts.from,
        to: facts.to,
        balances: facts.period.filter(
          (b) => facts.accounts.find((a) => a.id === b.account_id)?.account_type === "income",
        ),
      },
    ];
    const build = () =>
      buildReportDocument(facts, { name: definition.title, config: { _builder: definition } });
    expect(build).toThrow("Captured facts do not match");
    facts.appliedFilters = reportFiltersSchema.parse({
      clauses: [{ field: "account_type", op: "eq", values: ["expense"] }],
    });
    expect(build).toThrow("Captured facts do not match");
    facts.appliedFilters = reportFiltersSchema.parse({
      clauses: [{ field: "account_type", op: "eq", values: ["income"] }],
    });
    const doc = build();
    expect(doc.subtitle).toContain("Filtered report");
    expect(doc.notes).toContain("Account type equals income");
    expect(exportReportCsv(doc)).toContain("Report filters:");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await exportReportXlsx(doc)) as unknown as ExcelJS.Buffer);
    expect(JSON.stringify(workbook.model)).toContain("Account type equals income");
    expect((await PDFDocument.load(await exportReportPdf(doc))).getPageCount()).toBeGreaterThan(0);
  });
  it("renders custom monetary constants and percentage ratios from minor-unit ledger facts", () => {
    const facts = reportingFactsFixture();
    facts.customColumns = [
      { id: "current", from: facts.from, to: facts.to, balances: facts.period },
    ];
    const definition = starterDefinition();
    definition.rows[2]!.formula = "[revenue] - [expenses] + 100";
    const doc = buildReportDocument(facts, {
      name: definition.title,
      config: { _builder: definition },
    });
    expect(doc.sections[0]!.rows[2]!.values).toEqual(["210.00"]);
    expect(doc.sections[0]!.rows[3]!.values).toEqual(["140.00"]);
  });
  it("keeps calculated variance percentage columns consistent across document, CSV and Excel", async () => {
    const facts = reportingFactsFixture();
    const definition = customDefinitionSchema.parse({
      ...starterDefinition(),
      columns: [
        { id: "current", label: "Actual", mode: "period" },
        { id: "prior", label: "Prior", mode: "prior_period" },
        {
          id: "variance",
          label: "Variance",
          mode: "calculated",
          formula: "[current]-[prior]",
          format: "money",
        },
        {
          id: "percentage",
          label: "Variance %",
          mode: "calculated",
          formula: "[variance]/[prior]",
          format: "percent",
        },
      ],
    });
    facts.customColumns = definition.columns.map((c) => ({
      id: c.id,
      from: facts.from,
      to: facts.to,
      balances:
        c.mode === "calculated"
          ? []
          : facts.period.map((b) => ({
              ...b,
              debit_minor: (BigInt(b.debit_minor) / (c.id === "prior" ? 2n : 1n)).toString(),
              credit_minor: (BigInt(b.credit_minor) / (c.id === "prior" ? 2n : 1n)).toString(),
            })),
    }));
    const doc = buildReportDocument(facts, {
      name: definition.title,
      config: { _builder: definition },
    });
    expect(doc.sections[0]!.rows[2]!.values).toEqual(["110.00", "55.00", "55.00", "100.00"]);
    expect(exportReportCsv(doc)).toContain('"100.00%"');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await exportReportXlsx(doc)) as unknown as ExcelJS.Buffer);
    expect(workbook.worksheets[0]!.getCell("E9").value).toBe(1);
    expect(workbook.worksheets[0]!.getCell("E9").numFmt).toBe("0.00%;(0.00%)");
  });
  it("applies display scaling, symbols, red negatives and zero styles without changing document balances", async () => {
    const facts = reportingFactsFixture();
    facts.customColumns = [
      { id: "current", from: facts.from, to: facts.to, balances: facts.period },
    ];
    const definition = starterDefinition();
    definition.display = {
      ...definition.display,
      scale: "100",
      thousands: false,
      negativeRed: true,
      currencySymbol: true,
      zero: "dash",
    };
    const doc = buildReportDocument(facts, {
      name: definition.title,
      config: { _builder: definition },
    });
    const net = doc.sections[0]!.rows[2]!;
    expect(net.values).toEqual(["110.00"]);
    expect(displayDocumentValue(net.values[0]!, net)).toBe("£1.10");
    expect(displayDocumentValue("-1234567.89", { ...net, scale: "1000", thousands: true })).toBe(
      "(£1,234.57)",
    );
    expect(displayDocumentValue("0.00", net)).toBe("–");
    expect(displayDocumentValue("0.00", { ...net, zero: "blank" })).toBe("");
    expect(displayDocumentValue("73.33", { ...net, format: "percent" })).toBe("73.33%");
    expect(doc.subtitle).toContain("divided by 100");
    expect(exportReportCsv(doc)).toContain('"1.10"');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await exportReportXlsx(doc)) as unknown as ExcelJS.Buffer);
    expect(workbook.worksheets[0]!.getCell("B9").value).toBe(1.1);
    expect(workbook.worksheets[0]!.getCell("B9").numFmt).toBe('"£"0.00;[Red]("£"0.00);"–"');
    expect(workbook.worksheets[0]!.getCell("B9").note).toBe(
      "Unscaled value: 110.00. Display divided by 100.",
    );
  });
  it("hides zero rows/columns and collapses groups while preserving formula dependencies", () => {
    const facts = reportingFactsFixture();
    const definition = customDefinitionSchema.parse({
      ...starterDefinition(),
      columns: [
        { id: "current", label: "Current", mode: "period" },
        { id: "zero", label: "Zero", mode: "calculated", formula: "[current]-[current]" },
      ],
      display: { rows: "non_zero", columns: "non_zero", sort: "label_desc" },
      rows: [
        ...starterDefinition().rows,
        { id: "empty", label: "Zero row", kind: "accounts" },
        {
          id: "total",
          label: "Combined",
          kind: "group",
          children: ["revenue", "expenses"],
          collapsed: true,
        },
      ],
    });
    facts.customColumns = [
      { id: "current", from: facts.from, to: facts.to, balances: facts.period },
      { id: "zero", from: facts.from, to: facts.to, balances: [] },
    ];
    const before = JSON.stringify(definition);
    const doc = buildReportDocument(facts, {
      name: definition.title,
      config: { _builder: definition },
    });
    expect(doc.sections[0]!.columns).toHaveLength(1);
    expect(doc.sections[0]!.rows.map((r) => r.label)).toEqual([
      "Net profit",
      "Net margin",
      "Combined",
    ]);
    expect(doc.sections[0]!.rows[0]!.values).toEqual(["110.00"]);
    expect(JSON.stringify(definition)).toBe(before);
  });
  it("exports an empty-period report with unavailable ratios instead of invented zero percentages", async () => {
    const facts = reportingFactsFixture();
    facts.period = [];
    facts.prior = [];
    facts.bsPrior = [];
    facts.bsCurrent = [];
    facts.cash = [];
    facts.customColumns = [{ id: "current", from: facts.from, to: facts.to, balances: [] }];
    const doc = buildReportDocument(facts, {
      name: "Empty-period review",
      config: { _builder: starterDefinition() },
    });
    expect(doc.sections[0]!.rows[2]!.values).toEqual(["0.00"]);
    expect(doc.sections[0]!.rows[3]!.values).toEqual(["Unavailable"]);
    expect(doc.sections[0]!.note).toContain("not zero balances");
    expect(displayDocumentValue("Unavailable", { format: "percent", scale: "1000" })).toBe(
      "Unavailable",
    );
    const csv = exportReportCsv(doc);
    expect(csv).toContain('"Unavailable"');
    expect(csv).not.toContain("Unavailable%");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await exportReportXlsx(doc)) as unknown as ExcelJS.Buffer);
    expect(workbook.worksheets[0]!.getCell("B10").value).toBe("Unavailable");
    const pdf = await PDFDocument.load(await exportReportPdf(doc));
    expect(pdf.getPageCount()).toBeGreaterThan(0);
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
  it("keeps negative percentage values and presentation consistent in preview and Excel", async () => {
    const doc = buildReportDocument(reportingFactsFixture(), {
      name: "Negative ratio",
      config: { reports: ["profit-and-loss"] },
    });
    const row = doc.sections[0]!.rows[0]!;
    row.values = ["-73.33"];
    row.format = "percent";
    row.negative = "parentheses";
    expect(displayDocumentValue(row.values[0]!, row)).toBe("(73.33%)");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await exportReportXlsx(doc)) as unknown as ExcelJS.Buffer);
    expect(workbook.worksheets[0]!.getCell("B7").value).toBe(-0.7333);
    expect(workbook.worksheets[0]!.getCell("B7").numFmt).toBe("0.00%;(0.00%)");
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
