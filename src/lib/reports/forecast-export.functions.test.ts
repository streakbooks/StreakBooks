import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate: (input: unknown) => unknown = (input) => input;
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
vi.mock("@/lib/planning/rpc", () => ({ callRpc: vi.fn() }));
vi.mock("./accounting-basis.server", () => ({ resolveReportingBasis: vi.fn() }));
vi.mock("./cash-report-facts.server", () => ({ captureCashReportFacts: vi.fn() }));
import { resolveReportingBasis } from "./accounting-basis.server";
import { captureCashReportFacts } from "./cash-report-facts.server";
import { cashReportingFacts } from "./cash-report-facts";
import { cashInputFixture } from "./__fixtures__/cash-facts";
import { exportForecast } from "./forecast-export.functions";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { callRpc } from "@/lib/planning/rpc";
import {
  reportingFactsFixture,
  revenueId,
  expenseId,
  bankId,
  testCompany,
} from "./__fixtures__/facts";
import { forecastSchema } from "./ecosystem-model";
import { PDFDocument } from "pdf-lib";
import ExcelJS from "exceljs";

const config = forecastSchema.parse({
  start: "2026-10-01",
  months: 2,
  baselineFrom: "2026-09-01",
  baselineTo: "2026-09-30",
  scenarios: [
    {
      id: "base",
      name: "Base case",
      revenueGrowthBps: 0,
      expenseGrowthBps: 0,
      assumptions: "No growth assumed",
    },
  ],
});
const context = { supabase: {} };
const execute = (data: unknown) =>
  (
    exportForecast as unknown as (
      args: unknown,
    ) => Promise<{ content: string; filename: string; mime: string }>
  )({ data, context });
const request = { companyId: testCompany, name: "Operating outlook", config, format: "csv" };
function facts(from: string, to: string) {
  const f = reportingFactsFixture();
  f.from = from;
  f.to = to;
  if (from === "2026-10-01") {
    f.period = [
      { account_id: bankId, debit_minor: "18000", credit_minor: "6000", line_count: 2 },
      { account_id: revenueId, debit_minor: "0", credit_minor: "18000", line_count: 1 },
      { account_id: expenseId, debit_minor: "6000", credit_minor: "0", line_count: 1 },
    ];
    f.bsCurrent = f.period;
  }
  return f;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveReportingBasis).mockResolvedValue("accrual");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-03T00:00:00Z"));
  vi.mocked(callRpc).mockImplementation(async (_sb, name, args) => {
    if (name === "record_app_audit_event") return true;
    const a = args as { _from: string; _to: string };
    return facts(a._from, a._to);
  });
});

afterEach(() => vi.useRealTimers());

describe("authoritative forecast downloads", () => {
  it("captures the baseline and completed months, and exports all exact comparisons", async () => {
    const file = await execute({ ...request, projections: [{ net: 999999 }] });
    const csv = Buffer.from(file.content, "base64").toString();
    expect(csv).toContain("Operating outlook");
    expect(csv).toContain("2026-10-01 to 2026-11-30");
    expect(csv).toContain("2026-09-01 to 2026-09-30");
    expect(csv).toContain("Actual profit");
    expect(csv).toContain('"120.00"');
    expect(csv).toContain('"10.00"');
    expect(csv).toContain('"9.09%"');
    expect(csv).toContain("Unavailable");
    expect(csv).not.toContain("999999");
    const captures = vi
      .mocked(callRpc)
      .mock.calls.filter((c) => c[1] === "capture_reporting_facts");
    expect(captures.map((c) => c[2])).toEqual([
      { _company_id: testCompany, _from: "2026-09-01", _to: "2026-09-30" },
      { _company_id: testCompany, _from: "2026-10-01", _to: "2026-10-31" },
    ]);
    expect(vi.mocked(assertCompanyPermission).mock.calls.map((c) => c[2])).toEqual([
      "reports.view",
      "reports.export",
    ]);
    expect(callRpc).toHaveBeenLastCalledWith(
      {},
      "record_app_audit_event",
      expect.objectContaining({ _company_id: testCompany, _action: "report.exported" }),
      expect.any(String),
    );
  });
  it("creates real Excel and PDF files with numeric variances and explicit projection notes", async () => {
    const file = await execute({ ...request, format: "xlsx" });
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(Buffer.from(file.content, "base64") as unknown as ExcelJS.Buffer);
    const sheet = book.worksheets[0]!;
    expect(sheet.getCell("G7").value).toBe(120);
    expect(sheet.getCell("L7").value).toBe(10);
    expect(sheet.getCell("M7").value).toBe(0.0909);
    expect(sheet.getCell("G8").value).toBe("Unavailable");
    expect(JSON.stringify(book.model)).toContain("not cash forecasts");
    const pdf = await execute({ ...request, format: "pdf" });
    expect(
      (await PDFDocument.load(Buffer.from(pdf.content, "base64"))).getPageCount(),
    ).toBeGreaterThan(0);
  });
  it.each(["reports.view", "reports.export"])(
    "denies missing %s before ledger access",
    async (denied) => {
      vi.mocked(assertCompanyPermission).mockImplementation(async (_sb, _id, permission) => {
        if (permission === denied) throw new Error("Denied");
      });
      await expect(execute(request)).rejects.toThrow("Denied");
      expect(callRpc).not.toHaveBeenCalled();
    },
  );
  it.each(["company", "dates", "currency"])(
    "rejects mismatched capture %s and emits no export audit",
    async (mismatch) => {
      vi.mocked(callRpc).mockImplementation(async (_sb, _name, args) => {
        const a = args as { _from: string; _to: string };
        const f = facts(a._from, a._to);
        if (mismatch === "company") f.company.id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
        if (mismatch === "dates") f.from = "2026-08-01";
        if (mismatch === "currency" && a._from === "2026-10-01") f.company.baseCurrency = "USD";
        return f;
      });
      await expect(execute(request)).rejects.toThrow();
      expect(vi.mocked(callRpc).mock.calls.some((c) => c[1] === "record_app_audit_event")).toBe(
        false,
      );
    },
  );
  it("rejects incomplete baseline periods before requesting accounting data", async () => {
    await expect(
      execute({ ...request, config: { ...config, baselineFrom: "2026-09-02" } }),
    ).rejects.toThrow("complete calendar months");
    expect(callRpc).not.toHaveBeenCalled();
  });
});

it("uses the company cash default for forecast baselines, actuals and exported basis", async () => {
  vi.mocked(resolveReportingBasis).mockResolvedValue("cash");
  vi.mocked(captureCashReportFacts).mockImplementation(async (_sb, _companyId, from, to) => {
    const input = cashInputFixture();
    input.journals[0]!.date = "2026-08-15";
    input.journals[1]!.date = "2026-08-15";
    input.journals[2]!.date = "2026-09-15";
    input.journals[3]!.date = "2026-10-15";
    const base = facts(from, to);
    base.accounts = input.accounts;
    return cashReportingFacts(base, input);
  });
  const file = await execute(request);
  const csv = Buffer.from(file.content, "base64").toString();
  expect(csv).toContain("Cash basis");
  expect(csv).toContain('"50.00"');
  expect(csv).toContain('"-40.00"');
  expect(vi.mocked(captureCashReportFacts).mock.calls.map((call) => call.slice(1))).toEqual([
    [testCompany, "2026-09-01", "2026-09-30"],
    [testCompany, "2026-10-01", "2026-10-31"],
  ]);
  expect(vi.mocked(callRpc).mock.calls.some((call) => call[1] === "capture_reporting_facts")).toBe(
    false,
  );
});

it("preserves an explicit forecast basis override in server capture", async () => {
  await execute({ ...request, config: { ...config, basis: "accrual" } });
  expect(resolveReportingBasis).toHaveBeenCalledWith(context.supabase, testCompany, "accrual");
});
