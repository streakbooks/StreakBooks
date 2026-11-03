import { describe, expect, it } from "vitest";
import {
  prepareReportExplorer,
  selectedExplorerColumns,
  standardDocumentExplorerCsv,
} from "./report-explorer";
import type { ReportDocument } from "./report-document";

const sample = {
  headers: ["Date", "Account", "Reference", "Movement"],
  rows: [
    ["2026-01-02", "Cash", "0009", "12.50"],
    ["2026-01-03", "Sales", "0010", "-99.01"],
    ["2026-01-04", "Cash", "0011", "1.00"],
    ["2026-01-05", "Total", "", "-85.51"],
  ],
  basis: "Posted ledger.",
};

describe("shared reporting explorer", () => {
  it("keeps every source cell and original order without customization", () => {
    const result = prepareReportExplorer(sample);
    expect(result.headers).toEqual(sample.headers);
    expect(result.exportRows).toEqual(sample.rows);
    expect(result.sourceTotal).toBe(4);
    expect(result.total).toBe(4);
    expect(sample.rows[0]).toEqual(["2026-01-02", "Cash", "0009", "12.50"]);
  });

  it("validates saved column indices and supports hiding and ordering", () => {
    expect(selectedExplorerColumns(sample.headers, "3,1,3,999,-2,NaN")).toEqual([3, 1]);
    expect(selectedExplorerColumns(sample.headers, "999,NaN")).toEqual([0, 1, 2, 3]);
    const view = prepareReportExplorer(sample, { columns: "2,0" });
    expect(view.headers).toEqual(["Reference", "Date"]);
    expect(view.exportRows[0]).toEqual(["0009", "2026-01-02"]);
  });

  it("filters across source cells and supports column-specific matching", () => {
    const byAccount = prepareReportExplorer(sample, { field: 1, match: "cash" });
    expect(byAccount.total).toBe(2);
    expect(byAccount.exportRows).toEqual([sample.rows[0], sample.rows[2]]);
    const global = prepareReportExplorer(sample, { query: "0010" });
    expect(global.total).toBe(1);
    expect(global.exportRows).toEqual([sample.rows[1]]);
  });

  it("sorts signed financial decimals without changing original strings or original report", () => {
    const view = prepareReportExplorer(sample, { sort: 3, direction: "asc" });
    expect(view.exportRows.map((row) => row[2])).toEqual(["0010", "", "0011", "0009"]);
    expect(sample.rows.map((row) => row[2])).toEqual(["0009", "0010", "0011", ""]);
  });

  it("sorts large decimal amounts exactly without floating-point rounding", () => {
    const view = prepareReportExplorer(
      {
        headers: ["Amount"],
        rows: [["9007199254740993.01"], ["9007199254740992.99"], ["-9007199254740993.01"]],
      },
      { sort: 0 },
    );
    expect(view.exportRows.map((row) => row[0])).toEqual([
      "-9007199254740993.01",
      "9007199254740992.99",
      "9007199254740993.01",
    ]);
  });

  it("groups rows as labels with counts, without inventing accounting subtotals", () => {
    const view = prepareReportExplorer(sample, { group: 1, columns: "1,3" });
    expect(view.groupCount).toBe(3);
    expect(view.exportRows).toEqual([
      ["Group: Cash (2 rows)", ""],
      ["Cash", "12.50"],
      ["Cash", "1.00"],
      ["Group: Sales (1 rows)", ""],
      ["Sales", "-99.01"],
      ["Group: Total (1 rows)", ""],
      ["Total", "-85.51"],
    ]);
    expect(view.basis).toContain("do not recalculate");
  });

  it("keeps export basis within the validated 300-character limit", () => {
    const view = prepareReportExplorer({ ...sample, basis: "Cash basis. " + "A".repeat(500) });
    expect(view.basis.length).toBeLessThanOrEqual(300);
    expect(view.basis).toContain("Cash basis.");
    expect(view.basis).toContain("do not recalculate accounting totals.");
  });

  it("paginates loaded rows and exports only visible page", () => {
    const input = {
      headers: ["Id", "Amount"],
      rows: Array.from({ length: 60 }, (_, i) => [String(i), String(i * 2)]),
    };
    const view = prepareReportExplorer(input, { page: 2, pageSize: 25 });
    expect(view.total).toBe(60);
    expect(view.totalPages).toBe(3);
    expect(view.page).toBe(2);
    expect(view.exportRows).toHaveLength(25);
    expect(view.exportRows[0]).toEqual(["25", "50"]);
    const beyond = prepareReportExplorer(input, { page: 9999, pageSize: 25 });
    expect(beyond.page).toBe(3);
  });

  it("keeps original statement section and row kind when flattening documents", () => {
    const document = {
      basis: "cash",
      sections: [
        {
          id: "assets",
          title: "Assets",
          columns: ["2026", "2025"],
          rows: [
            { kind: "account", label: "Cash", values: ["100.00", "80.00"] },
            { kind: "total", label: "Total assets", values: ["100.00", "80.00"] },
          ],
        },
        {
          id: "equity",
          title: "Equity",
          columns: ["2025", "2024"],
          rows: [{ kind: "total", label: "Total equity", values: ["80.00", "50.00"] }],
        },
      ],
    } as unknown as ReportDocument;
    const out = standardDocumentExplorerCsv(document);
    expect(out.basis).toContain("Cash basis");
    expect(out.headers).toEqual(["Section", "Line", "Row type", "2026", "2025", "2024"]);
    expect(out.rows).toEqual([
      ["Assets", "Cash", "account", "100.00", "80.00", ""],
      ["Assets", "Total assets", "total", "100.00", "80.00", ""],
      ["Equity", "Total equity", "total", "", "80.00", "50.00"],
    ]);
  });
});
