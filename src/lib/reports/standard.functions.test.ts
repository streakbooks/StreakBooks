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
import { getStandardStatement, exportStandardStatement } from "./standard.functions";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { callRpc } from "@/lib/planning/rpc";
import { reportingFactsFixture } from "./__fixtures__/facts";
import { standardSettingsSchema } from "./standard-settings";
const settings = standardSettingsSchema.parse({});
const context = { supabase: {}, userId: "actor" };
const data = {
  companyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  report: "profit-and-loss",
  from: "2026-10-01",
  to: "2026-10-31",
  settings,
};
const run = (fn: unknown, input: unknown) =>
  (fn as (args: unknown) => Promise<unknown>)({ data: input, context });
beforeEach(() => {
  vi.resetAllMocks();
  const f = reportingFactsFixture();
  f.standardColumns = [
    {
      label: "Selected period",
      from: f.from,
      to: f.to,
      fyStart: f.fyStart,
      period: f.period,
      bsPrior: f.bsPrior,
      bsCurrent: f.bsCurrent,
    },
  ];
  f.appliedFilters = settings.filters;
  vi.mocked(callRpc).mockResolvedValue(f);
});
describe("standard statement server boundaries", () => {
  it("requests authoritative company-scoped captured periods and derives the document server-side", async () => {
    const doc = (await run(getStandardStatement, { ...data, facts: { net: 999999 } })) as {
      sections: Array<{ rows: Array<{ label: string; values: string[] }> }>;
    };
    expect(doc.sections[0]!.rows.find((r) => r.label === "Net profit")!.values).toEqual(["110.00"]);
    expect(callRpc).toHaveBeenCalledWith(
      context.supabase,
      "capture_standard_report_facts",
      expect.objectContaining({
        _company_id: data.companyId,
        _report_id: data.report,
        _settings: settings,
      }),
      expect.any(String),
    );
  });
  it.each([getStandardStatement, exportStandardStatement])(
    "rejects missing financial permission before any capture",
    async (fn) => {
      vi.mocked(assertCompanyPermission).mockRejectedValueOnce(new Error("Denied"));
      await expect(run(fn, { ...data, format: "csv" })).rejects.toThrow("Denied");
      expect(callRpc).not.toHaveBeenCalled();
    },
  );
  it.each([
    { from: "2026-02-30" },
    { report: "other" },
    { settings: { compare: "custom" } },
    { settings: { compare: "none", changePercent: true } },
    { settings: { basis: "modified_cash" } },
  ])("rejects invalid or unsupported report requests %o", async (patch) => {
    await expect(run(getStandardStatement, { ...data, ...patch })).rejects.toThrow();
    expect(callRpc).not.toHaveBeenCalled();
  });
  it("requires export permission and records an audited real export", async () => {
    const file = (await run(exportStandardStatement, { ...data, format: "csv" })) as {
      content: string;
      mime: string;
      filename: string;
    };
    expect(vi.mocked(assertCompanyPermission).mock.calls.map((c) => c[2])).toEqual([
      "reports.export",
      "reports.view",
    ]);
    expect(Buffer.from(file.content, "base64").toString()).toContain("110.00");
    expect(file.filename).toBe("profit-and-loss-2026-10-31.csv");
    expect(callRpc).toHaveBeenLastCalledWith(
      context.supabase,
      "record_audit_event",
      expect.objectContaining({ _company_id: data.companyId, _action: "report.exported" }),
      expect.any(String),
    );
  });
});

describe("standard capture provenance", () => {
  it("rejects reversed dates before requesting ledger facts", async () => {
    await expect(
      run(getStandardStatement, { ...data, from: "2026-11-01", to: "2026-10-01" }),
    ).rejects.toThrow("End date");
    expect(callRpc).not.toHaveBeenCalled();
  });
  it.each(["company", "from", "to"])(
    "rejects captured %s outside the requested scope",
    async (field) => {
      const f = reportingFactsFixture();
      if (field === "company") f.company.id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
      if (field === "from") f.from = "2026-09-01";
      if (field === "to") f.to = "2026-11-01";
      vi.mocked(callRpc).mockResolvedValue(f);
      await expect(run(exportStandardStatement, { ...data, format: "csv" })).rejects.toThrow(
        "do not match",
      );
      expect(callRpc).toHaveBeenCalledTimes(1);
    },
  );
});
