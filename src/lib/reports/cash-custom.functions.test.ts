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

import {
  previewCustomReport,
  captureReportDocument,
  exportReportDocument,
  queueReportDelivery,
} from "./ecosystem.functions";
import { loadCashProfitLossInput } from "./cash-profit-loss.server";
import { callRpc } from "@/lib/planning/rpc";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { cashInputFixture } from "./__fixtures__/cash-facts";
import { reportingFactsFixture, testCompany } from "./__fixtures__/facts";
import { customDefinitionSchema, starterDefinition } from "./custom-definition";
import type { ReportDocument } from "./report-document";
import { PDFDocument } from "pdf-lib";
import ExcelJS from "exceljs";

const viewId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const definition = customDefinitionSchema.parse({
  ...starterDefinition("Cash custom report"),
  basis: "cash",
});
const dates = { from: "2026-11-01", to: "2026-11-30" };
let config: Record<string, unknown>;
let savedReportId = "profit-and-loss";
let companyBasis = "accrual";
const query = {
  select() {
    return this;
  },
  eq() {
    return this;
  },
  async single() {
    return { data: { name: "Cash custom report", report_id: savedReportId, config }, error: null };
  },
  async maybeSingle() {
    return { data: { document: { reporting_basis: companyBasis } }, error: null };
  },
};
const supabase = { from: () => query };
const execute = <T>(fn: unknown, data: unknown) =>
  (fn as (args: unknown) => Promise<T>)({ data, context: { supabase } });

beforeEach(() => {
  vi.resetAllMocks();
  savedReportId = "profit-and-loss";
  companyBasis = "accrual";
  config = { ...dates, basis: "cash", _builder: definition };
  vi.mocked(loadCashProfitLossInput).mockImplementation(async () => cashInputFixture());
  vi.mocked(callRpc).mockImplementation(async (_sb, name, args) => {
    if (name === "record_app_audit_event") return true;
    if (name === "cash_reporting_capabilities") return 1;
    if (name === "get_reporting_delivery_status") return { configured: true };
    if (name === "queue_report_delivery") return viewId;
    const facts = reportingFactsFixture();
    facts.accounts = cashInputFixture().accounts;
    facts.from = (args as { _from: string })._from;
    facts.to = (args as { _to: string })._to;
    facts.customColumns = [
      { id: "current", from: facts.from, to: facts.to, balances: facts.period },
    ];
    return facts;
  });
});

describe("custom cash API, saved reports and exports", () => {
  it("applies the persisted cash default to legacy preview, saved capture and export definitions", async () => {
    companyBasis = "cash";
    const legacy: Record<string, unknown> = { ...definition };
    delete legacy["basis"];
    config = { ...dates, _builder: legacy };
    const preview = JSON.parse(
      await execute<string>(previewCustomReport, {
        companyId: testCompany,
        ...dates,
        definition: legacy,
      }),
    ) as ReportDocument;
    const capture = JSON.parse(
      await execute<string>(captureReportDocument, {
        companyId: testCompany,
        viewId,
      }),
    ) as ReportDocument;
    expect(preview.basis).toBe("cash");
    expect(capture.sections).toEqual(preview.sections);
    expect(capture.sections[0]!.rows.find((row) => row.label === "Net profit")!.values).toEqual([
      "10.00",
    ]);
    const file = await execute<{ content: string }>(exportReportDocument, {
      companyId: testCompany,
      viewId,
      format: "csv",
    });
    expect(Buffer.from(file.content, "base64").toString()).toContain('"Net profit","10.00"');
    expect(config["_builder"]).not.toHaveProperty("basis");
    expect(
      vi.mocked(callRpc).mock.calls.some((call) => call[1] === "capture_custom_report_facts"),
    ).toBe(false);
  });

  it("uses explicit accrual definitions when the persisted company default is cash", async () => {
    companyBasis = "cash";
    config = { ...dates, basis: "cash", _builder: { ...definition, basis: "accrual" } };
    const capture = JSON.parse(
      await execute<string>(captureReportDocument, {
        companyId: testCompany,
        viewId,
      }),
    ) as ReportDocument;
    expect(capture.basis).toBe("accrual");
    expect(loadCashProfitLossInput).not.toHaveBeenCalled();
    expect(vi.mocked(callRpc).mock.calls[0]?.[1]).toBe("capture_custom_report_facts");
  });

  it("checks cash delivery capability for a legacy custom view inheriting company cash basis", async () => {
    companyBasis = "cash";
    const legacy: Record<string, unknown> = { ...definition };
    delete legacy["basis"];
    config = { ...dates, _builder: legacy };
    await execute(queueReportDelivery, {
      companyId: testCompany,
      payload: {
        viewId,
        ...dates,
        recipients: ["test@example.invalid"],
        subject: "Inherited cash report",
      },
    });
    expect(vi.mocked(callRpc).mock.calls[0]?.[1]).toBe("cash_reporting_capabilities");
  });

  it("uses the same allocated values in preview, saved capture and CSV export", async () => {
    const preview = JSON.parse(
      await execute<string>(previewCustomReport, { companyId: testCompany, ...dates, definition }),
    ) as ReportDocument;
    const saved = JSON.parse(
      await execute<string>(captureReportDocument, { companyId: testCompany, viewId }),
    ) as ReportDocument;
    expect(saved.sections).toEqual(preview.sections);
    expect(saved.sections[0]!.rows.find((row) => row.label === "Net profit")!.values).toEqual([
      "10.00",
    ]);
    expect(saved.basis).toBe("cash");
    const file = await execute<{ content: string }>(exportReportDocument, {
      companyId: testCompany,
      viewId,
      format: "csv",
    });
    const content = Buffer.from(file.content, "base64").toString();
    expect(content).toContain("Cash basis");
    expect(content).toContain('"Net profit","10.00"');
    expect(
      vi.mocked(callRpc).mock.calls.some((call) => call[1] === "capture_custom_report_facts"),
    ).toBe(false);
  });

  it("loads allocations through future fixed columns for comparative custom reports", async () => {
    const compared = customDefinitionSchema.parse({
      ...definition,
      columns: [
        ...definition.columns,
        { id: "next", label: "Next", mode: "fixed", from: "2026-12-01", to: "2026-12-31" },
      ],
    });
    await execute(previewCustomReport, { companyId: testCompany, ...dates, definition: compared });
    expect(loadCashProfitLossInput).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({ from: dates.from, to: dates.to }),
      "2026-12-31",
    );
  });

  it("keeps accrual custom reports on the existing database aggregates", async () => {
    const accrual = starterDefinition();
    const doc = JSON.parse(
      await execute<string>(previewCustomReport, {
        companyId: testCompany,
        ...dates,
        definition: accrual,
      }),
    ) as ReportDocument;
    expect(doc.basis).toBe("accrual");
    expect(doc.sections[0]!.rows.find((row) => row.label === "Net profit")!.values).toEqual([
      "110.00",
    ]);
    expect(loadCashProfitLossInput).not.toHaveBeenCalled();
    expect(vi.mocked(callRpc).mock.calls[0]?.[1]).toBe("capture_custom_report_facts");
  });

  it.each([
    { basis: "cash" },
    { settings: JSON.stringify({ basis: "cash" }) },
    { basis: "cash", settings: JSON.stringify({ basis: "accrual" }) },
  ])(
    "uses recognized cash facts for saved trial balance captures and exports: %j",
    async (saved) => {
      savedReportId = "trial-balance";
      config = { ...dates, ...saved };
      const document = JSON.parse(
        await execute<string>(captureReportDocument, { companyId: testCompany, viewId }),
      ) as ReportDocument;
      expect(document.basis).toBe("cash");
      expect(document.sections[0]!.rows.some((row) => row.values.includes("50.00"))).toBe(true);
      const file = await execute<{ content: string }>(exportReportDocument, {
        companyId: testCompany,
        viewId,
        format: "csv",
      });
      expect(Buffer.from(file.content, "base64").toString()).toContain("Cash basis");
    },
  );

  it("honors an explicit saved accrual override over stale cash settings", async () => {
    savedReportId = "trial-balance";
    config = { ...dates, basis: "accrual", settings: JSON.stringify({ basis: "cash" }) };
    const document = JSON.parse(
      await execute<string>(captureReportDocument, { companyId: testCompany, viewId }),
    ) as ReportDocument;
    expect(document.basis).not.toBe("cash");
    expect(loadCashProfitLossInput).not.toHaveBeenCalled();
    await execute(queueReportDelivery, {
      companyId: testCompany,
      payload: {
        viewId,
        ...dates,
        recipients: ["test@example.invalid"],
        subject: "Explicit accrual",
      },
    });
    expect(
      vi.mocked(callRpc).mock.calls.some((call) => call[1] === "cash_reporting_capabilities"),
    ).toBe(false);
  });

  it("uses the same cash custom figures in real PDF and Excel exports", async () => {
    const file = await execute<{ content: string }>(exportReportDocument, {
      companyId: testCompany,
      viewId,
      format: "xlsx",
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(file.content, "base64") as unknown as ExcelJS.Buffer);
    const sheet = workbook.worksheets[0]!;
    const profit = sheet
      .getRows(1, sheet.rowCount)!
      .find((row) => row.getCell(1).value === "Net profit");
    expect(profit?.getCell(2).value).toBe(10);
    expect(JSON.stringify(workbook.model)).toContain("Cash basis");
    const pdf = await execute<{ content: string }>(exportReportDocument, {
      companyId: testCompany,
      viewId,
      format: "pdf",
    });
    expect(
      (await PDFDocument.load(Buffer.from(pdf.content, "base64"))).getPageCount(),
    ).toBeGreaterThan(0);
  });

  it("checks immutable snapshot capability for cash builders even without top-level basis", async () => {
    delete config["basis"];
    await execute(queueReportDelivery, {
      companyId: testCompany,
      payload: {
        viewId,
        ...dates,
        recipients: ["test@example.invalid"],
        subject: "Cash custom report",
      },
    });
    expect(vi.mocked(callRpc).mock.calls[0]?.[1]).toBe("cash_reporting_capabilities");
  });

  it("denies cash source reads when financial access fails", async () => {
    vi.mocked(assertCompanyPermission).mockRejectedValue(new Error("Denied"));
    await expect(
      execute(previewCustomReport, { companyId: testCompany, ...dates, definition }),
    ).rejects.toThrow("Denied");
    expect(callRpc).not.toHaveBeenCalled();
    expect(loadCashProfitLossInput).not.toHaveBeenCalled();
  });
});
