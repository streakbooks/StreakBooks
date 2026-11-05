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
import { reportingFactsFixture, testCompany } from "./__fixtures__/facts";
import {
  captureReportDocument,
  exportReportDocument,
  queueReportDelivery,
  saveReportSchedule,
} from "./ecosystem.functions";
import { standardSettingsSchema, encodeStandardSettings } from "./standard-settings";
import { callRpc } from "@/lib/planning/rpc";

const viewId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
let config: Record<string, unknown>;
let companyBasis = "accrual";
const query = {
  select() {
    return this;
  },
  eq() {
    return this;
  },
  async single() {
    return { data: { name: "Cash P&L saved", report_id: "profit-and-loss", config }, error: null };
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
  companyBasis = "accrual";
  config = {
    from: "2026-11-01",
    to: "2026-11-30",
    basis: "cash",
    settings: encodeStandardSettings(standardSettingsSchema.parse({ basis: "cash" })),
  };
  vi.mocked(loadCashProfitLossInput).mockImplementation(async () => cashInputFixture());
  vi.mocked(callRpc).mockImplementation(async (_sb, name, args) => {
    if (name === "record_audit_event") return true;
    if (name === "cash_reporting_capabilities") return 1;
    if (name === "get_reporting_delivery_status") return { configured: true };
    if (name === "queue_report_delivery" || name === "save_report_schedule") return viewId;
    const f = reportingFactsFixture();
    f.accounts = cashInputFixture().accounts;
    f.from = (args as { _from: string })._from;
    f.to = (args as { _to: string })._to;
    return f;
  });
});
describe("saved cash report lifecycle", () => {
  it.each([undefined, "{}"])(
    "inherits company cash basis for a legacy saved statement: %s",
    async (settings) => {
      companyBasis = "cash";
      config = { from: "2026-11-01", to: "2026-11-30", ...(settings ? { settings } : {}) };
      const doc = JSON.parse(
        await execute<string>(captureReportDocument, { companyId: testCompany, viewId }),
      );
      expect(doc.basis).toBe("cash");
      expect(
        doc.sections[0].rows.find((row: { label: string }) => row.label === "Net profit").values,
      ).toEqual(["10.00"]);
      const file = await execute<{ content: string }>(exportReportDocument, {
        companyId: testCompany,
        viewId,
        format: "csv",
      });
      expect(Buffer.from(file.content, "base64").toString()).toContain('"Net profit","10.00"');
      expect(config).not.toHaveProperty("basis");
    },
  );

  it.each([false, true])(
    "captures and exports saved cash settings, including legacy basis-only views: %s",
    async (legacy) => {
      if (legacy) delete config["settings"];
      const doc = JSON.parse(
        await execute<string>(captureReportDocument, { companyId: testCompany, viewId }),
      );
      expect(doc.basis).toBe("cash");
      expect(
        doc.sections[0].rows.find((row: { label: string }) => row.label === "Net profit").values,
      ).toEqual(["10.00"]);
      const file = await execute<{ content: string }>(exportReportDocument, {
        companyId: testCompany,
        viewId,
        format: "csv",
      });
      expect(Buffer.from(file.content, "base64").toString()).toContain("Cash basis");
      expect(
        vi.mocked(callRpc).mock.calls.some((call) => call[1] === "capture_standard_report_facts"),
      ).toBe(false);
    },
  );
  it("queues cash reports only after verifying database snapshot capability", async () => {
    await expect(
      execute(queueReportDelivery, {
        companyId: testCompany,
        payload: {
          viewId,
          from: "2026-11-01",
          to: "2026-11-30",
          recipients: ["test@example.invalid"],
          subject: "Cash report",
        },
      }),
    ).resolves.toBe(viewId);
    expect(vi.mocked(callRpc).mock.calls[0]?.[1]).toBe("cash_reporting_capabilities");
  });
  it("schedules cash reports through the snapshot-aware queue", async () => {
    await expect(
      execute(saveReportSchedule, {
        companyId: testCompany,
        payload: {
          viewId,
          recipients: ["test@example.invalid"],
          subject: "Cash report",
          recurrence: "monthly",
          period: "previous_month",
          timezone: "UTC",
          nextRunAt: "2026-12-01T00:00:00Z",
          enabled: true,
        },
      }),
    ).resolves.toBe(viewId);
    expect(vi.mocked(callRpc).mock.calls[0]?.[1]).toBe("cash_reporting_capabilities");
  });
});
