import { beforeEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import ExcelJS from "exceljs";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: (input: unknown) => unknown = (v) => v;
    const chain = {
      middleware() {
        return chain;
      },
      validator(fn: (input: unknown) => unknown) {
        validate = fn;
        return chain;
      },
      handler(fn: (args: { data: unknown; context: unknown }) => Promise<unknown>) {
        return async (args: { data: unknown; context: unknown }) =>
          fn({ ...args, data: validate(args.data) });
      },
    };
    return chain;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/assert-company-access", () => ({ assertCompanyPermission: vi.fn() }));
vi.mock("@/lib/planning/rpc", () => ({ callRpc: vi.fn().mockResolvedValue(true) }));
import { exportVisibleReport } from "./visible-export.functions";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { callRpc } from "@/lib/planning/rpc";

const request = {
  companyId: "11111111-1111-4111-8111-111111111111",
  reportId: "sales-by-contact",
  title: "Sales by Contact",
  companyName: "Example Co",
  currency: "GBP",
  from: "2026-01-01",
  to: "2026-01-31",
  basis: "Posted documents · filtered rows",
  headers: ["Customer", "Invoice count", "Net sales"],
  rows: [
    ["Acme", "1", "125.50"],
    ["Other", "2", "-22.25"],
  ],
};
const execute = (data: Record<string, unknown>) =>
  (
    exportVisibleReport as unknown as (x: {
      data: unknown;
      context: unknown;
    }) => Promise<{ content: string; mime: string; filename: string }>
  )({
    data,
    context: { supabase: {} },
  });

describe("permission-bound unified report downloads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(assertCompanyPermission).mockResolvedValue(undefined);
  });

  it("exports a real PDF with report-specific source label", async () => {
    const file = await execute({ ...request, format: "pdf" });
    const bytes = Uint8Array.from(atob(file.content), (c) => c.charCodeAt(0));
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(0);
    expect(pdf.getTitle()).toBe(request.title);
    expect(file.filename).toBe("sales-by-contact-2026-01-31.pdf");
    expect(assertCompanyPermission).toHaveBeenCalledWith({}, request.companyId, "reports.export");
    expect(callRpc).toHaveBeenCalledWith(
      {},
      "record_app_audit_event",
      expect.objectContaining({
        _action: "report.exported",
      }),
      expect.any(String),
    );
  });

  it("exports a genuine Excel worksheet with numeric cells", async () => {
    const file = await execute({ ...request, format: "xlsx" });
    const bytes = Uint8Array.from(atob(file.content), (c) => c.charCodeAt(0));
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(bytes as unknown as ExcelJS.Buffer);
    expect(book.worksheets[0]?.getCell("A6").value).toBe("Customer");
    expect(book.worksheets[0]?.getCell("B7").value).toBe(1);
    expect(book.worksheets[0]?.getCell("C7").value).toBe(125.5);
  });

  it("exports UTF-8 CSV with safe spreadsheet text", async () => {
    const file = await execute({
      ...request,
      format: "csv",
      rows: [["=HYPERLINK(1)", "1", "125.50"]],
    });
    const csv = new TextDecoder().decode(
      Uint8Array.from(atob(file.content), (c) => c.charCodeAt(0)),
    );
    expect(csv).toContain("Customer");
    expect(csv).toContain("'=HYPERLINK(1)");
  });

  it("exports single-column PDF rows and wide comparison CSV", async () => {
    const pdfFile = await execute({
      ...request,
      format: "pdf",
      headers: ["Account"],
      rows: [["Cash"], ["Sales"]],
    });
    const pdfBytes = Uint8Array.from(atob(pdfFile.content), (c) => c.charCodeAt(0));
    const pdf = await PDFDocument.load(pdfBytes);
    expect(pdf.getPageCount()).toBeGreaterThan(0);

    const headers = Array.from({ length: 29 }, (_, i) => "Column " + i);
    const wideFile = await execute({
      ...request,
      format: "csv",
      headers,
      rows: [headers.map((_, i) => String(i))],
    });
    const csv = new TextDecoder().decode(
      Uint8Array.from(atob(wideFile.content), (c) => c.charCodeAt(0)),
    );
    expect(csv).toContain("Column 28");
  });

  it("exports 100-column comparisons as CSV without bypassing PDF width safeguards", async () => {
    const headers = Array.from({ length: 100 }, (_, i) => "Period " + i);
    const rows = [headers.map((_, i) => String(i))];
    const file = await execute({ ...request, format: "csv", headers, rows });
    const csv = new TextDecoder().decode(
      Uint8Array.from(atob(file.content), (c) => c.charCodeAt(0)),
    );
    expect(csv).toContain("Period 99");
    await expect(execute({ ...request, format: "pdf", headers, rows })).rejects.toThrow(
      "PDF supports at most 32 visible columns",
    );
  });

  it("blocks mismatched and oversized rows before permission or export", async () => {
    await expect(execute({ ...request, format: "pdf", rows: [["Incomplete"]] })).rejects.toThrow();
    await expect(
      execute({
        ...request,
        format: "pdf",
        rows: Array.from({ length: 2001 }, () => ["a", "1", "2"]),
      }),
    ).rejects.toThrow();
    expect(assertCompanyPermission).not.toHaveBeenCalled();
  });
});

describe("screen export fidelity and authorization", () => {
  it("retains journal references, source text and leading-zero account codes as Excel text", async () => {
    const file = await execute({
      ...request,
      format: "xlsx",
      headers: ["Date", "Journal", "Source", "Account code", "Debit"],
      rows: [
        ["2026-01-15", "#14", "invoice", "001230", "12.50"],
        ["2026-01-16", "- adjustment", "=HYPERLINK(1)", "0000", "-2.25"],
      ],
    });
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Buffer.from(file.content, "base64") as unknown as ExcelJS.Buffer);
    const sheet = book.worksheets[0]!;
    expect(sheet.getCell("A7").value).toBe("2026-01-15");
    expect(sheet.getCell("B7").value).toBe("#14");
    expect(sheet.getCell("C7").value).toBe("invoice");
    expect(sheet.getCell("D7").value).toBe("001230");
    expect(sheet.getCell("E7").value).toBe(12.5);
    expect(sheet.getCell("B8").value).toBe("- adjustment");
    expect(sheet.getCell("C8").value).toBe("=HYPERLINK(1)");
    expect(sheet.getCell("D8").value).toBe("0000");
    expect(sheet.getCell("E8").value).toBe(-2.25);
  });

  it.each(["2026-02-30", "2026-13-01"])("rejects impossible calendar date %s", async (from) => {
    await expect(execute({ ...request, from, format: "csv" })).rejects.toThrow();
    expect(assertCompanyPermission).not.toHaveBeenCalled();
  });

  it("requires both viewing and exporting permissions before rendering or auditing", async () => {
    vi.mocked(assertCompanyPermission).mockImplementation(async (_sb, _company, permission) => {
      if (permission === "reports.view") throw new Error("View denied");
    });
    await expect(execute({ ...request, format: "csv" })).rejects.toThrow("View denied");
    expect(callRpc).not.toHaveBeenCalled();
  });
});
