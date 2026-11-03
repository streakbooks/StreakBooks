import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: (input: unknown) => unknown = (input) => input;
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
vi.mock("@/lib/planning/rpc", () => ({ callRpc: vi.fn() }));
vi.mock("./cash-profit-loss.server", () => ({ loadCashProfitLossInput: vi.fn() }));
import { loadCashProfitLossInput } from "./cash-profit-loss.server";
import { cashInputFixture } from "./__fixtures__/cash-facts";
import { reportingFactsFixture, testCompany, revenueId } from "./__fixtures__/facts";
import { getStandardStatement, exportStandardStatement } from "./standard.functions";
import { getCashProfitLossTransactions } from "./cash-drill.functions";
import { standardSettingsSchema, encodeStandardSettings } from "./standard-settings";
import { buildReportDocument, type ReportDocument } from "./report-document";
import { validateSavedConfig } from "./saved-report";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { callRpc } from "@/lib/planning/rpc";
import ExcelJS from "exceljs";
import { PDFDocument } from "pdf-lib";

const settings = standardSettingsSchema.parse({ basis: "cash" });
const data = {
  companyId: testCompany,
  report: "profit-and-loss",
  from: "2026-11-01",
  to: "2026-11-30",
  settings,
};
const execute = <T>(fn: unknown, input: unknown) =>
  (fn as (args: unknown) => Promise<T>)({ data: input, context: { supabase: {} } });
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(loadCashProfitLossInput).mockImplementation(async () => cashInputFixture());
  vi.mocked(callRpc).mockImplementation(async (_sb, name, args) => {
    if (name === "record_audit_event") return true;
    const f = reportingFactsFixture();
    f.accounts = cashInputFixture().accounts;
    f.from = (args as { _from: string })._from;
    f.to = (args as { _to: string })._to;
    return f;
  });
});
describe("server-integrated cash P&L and downloads", () => {
  it("builds a cash statement from posted allocation facts, not the accrual totals or caller-supplied numbers", async () => {
    const doc = (await execute<ReportDocument>(getStandardStatement, {
      ...data,
      cashNet: 999999,
    })) as ReportDocument;
    expect(doc.basis).toBe("cash");
    expect(doc.sections[0]!.rows.find((row) => row.label === "Net profit")!.values).toEqual([
      "10.00",
    ]);
    expect(doc.sections[0]!.note).toContain("Cash basis");
    expect(doc.notes).toContain("Unpaid documents and noncash credit allocations are excluded");
    expect(callRpc).toHaveBeenCalledWith(
      {},
      "capture_reporting_facts",
      expect.objectContaining({ _company_id: testCompany }),
      expect.any(String),
    );
    expect(loadCashProfitLossInput).toHaveBeenCalledTimes(1);
    const saved = validateSavedConfig({
      from: data.from,
      to: data.to,
      basis: "cash",
      settings: encodeStandardSettings(settings),
    });
    expect(JSON.parse(saved.settings!).basis).toBe("cash");
  });
  it("uses cash dates for monthly and prior-period comparison columns", async () => {
    const doc = (await execute<ReportDocument>(getStandardStatement, {
      ...data,
      settings: standardSettingsSchema.parse({
        basis: "cash",
        group: "month",
        compare: "prior_period",
        changeAmount: true,
        changePercent: true,
      }),
    })) as ReportDocument;
    const net = doc.sections[0]!.rows.find((row) => row.label === "Net profit")!;
    expect(net.values).toEqual(["10.00", "10.00", "0.00", "10.00", "Unavailable"]);
  });
  it("exports cash figures with their basis and exact numeric workbook cells", async () => {
    const csv = await execute<{ content: string }>(exportStandardStatement, {
      ...data,
      format: "csv",
    });
    const content = Buffer.from(csv.content, "base64").toString();
    expect(content).toContain("Cash basis");
    expect(content).toContain('"10.00"');
    const file = await execute<{ content: string }>(exportStandardStatement, {
      ...data,
      format: "xlsx",
    });
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Buffer.from(file.content, "base64") as unknown as ExcelJS.Buffer);
    expect(JSON.stringify(book.model)).toContain("Cash basis");
    const net = book.worksheets[0]!.getRows(1, book.worksheets[0]!.rowCount)!.find(
      (row) => row.getCell(1).value === "Net profit",
    )!;
    expect(net.getCell(2).value).toBe(10);
    const pdf = await execute<{ content: string }>(exportStandardStatement, {
      ...data,
      format: "pdf",
    });
    expect(
      (await PDFDocument.load(Buffer.from(pdf.content, "base64"))).getPageCount(),
    ).toBeGreaterThan(0);
  });
  it("drills down to the recognized receipt amount rather than the invoice's accrual revenue", async () => {
    const drill = await execute<{ credit: string; rows: Array<Record<string, string>> }>(
      getCashProfitLossTransactions,
      { ...data, accountId: revenueId },
    );
    expect(drill.credit).toBe("5000");
    expect(drill.rows).toHaveLength(1);
    expect(drill.rows[0]).toMatchObject({
      journalId: "receipt-journal",
      sourceJournalId: "invoice-journal",
      date: "2026-11-02",
      credit: "5000",
    });
  });
  it("never labels an accrual snapshot as cash, including queued-worker rendering", () => {
    const f = reportingFactsFixture();
    expect(() =>
      buildReportDocument(f, {
        name: "Cash P&L",
        reportId: "profit-and-loss",
        config: { settings: encodeStandardSettings(settings) },
      }),
    ).toThrow("Cash-basis facts were not captured");
  });
  it("rejects cash Balance Sheet and accrual-only filters explicitly", async () => {
    await expect(
      execute<ReportDocument>(getStandardStatement, { ...data, report: "balance-sheet" }),
    ).rejects.toThrow("Profit and Loss only");
    await expect(
      execute<ReportDocument>(getStandardStatement, {
        ...data,
        settings: standardSettingsSchema.parse({
          basis: "cash",
          filters: { clauses: [{ field: "memo", op: "contains", values: ["test"] }] },
        }),
      }),
    ).rejects.toThrow("Clear them");
    expect(loadCashProfitLossInput).not.toHaveBeenCalled();
  });
  it("denies financial access before loading settlement data", async () => {
    vi.mocked(assertCompanyPermission).mockRejectedValue(new Error("Denied"));
    await expect(execute<ReportDocument>(getStandardStatement, data)).rejects.toThrow("Denied");
    expect(loadCashProfitLossInput).not.toHaveBeenCalled();
    expect(callRpc).not.toHaveBeenCalled();
  });
});
