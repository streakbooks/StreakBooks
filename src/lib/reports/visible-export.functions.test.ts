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
      inputValidator(fn: (input: unknown) => unknown) {
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
      "record_audit_event",
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
