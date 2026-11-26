import { beforeEach, describe, expect, it, vi } from "vitest";

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
        return (args: { data: unknown; context: unknown }) =>
          fn({ ...args, data: validate(args.data) });
      },
    };
    return chain;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/assert-company-access", () => ({ assertCompanyPermission: vi.fn() }));

import { assertCompanyPermission } from "@/lib/assert-company-access";
import { REQUIRED_LEDGER_HEALTH_CHECKS } from "./ledger-health";
import { runLedgerHealthCheck } from "./ledger-health.functions";

const companyId = "11111111-1111-4111-8111-111111111111";
const foreignCompany = "22222222-2222-4222-8222-222222222222";
const payload = () => ({
  company_id: companyId,
  base_currency: "GBP",
  generated_at: "2026-11-04T12:00:00Z",
  overall: "pass",
  journals_checked: 0,
  lines_checked: 0,
  checks: REQUIRED_LEDGER_HEALTH_CHECKS.map((key) => ({
    key,
    label: key,
    status: "pass",
    count: 0,
    summary: "No discrepancies",
    items: [],
  })),
});

const rpc = vi.fn();
const call = (id = companyId) =>
  (runLedgerHealthCheck as unknown as (args: unknown) => Promise<unknown>)({
    data: { companyId: id },
    context: { supabase: { rpc } },
  });

beforeEach(() => {
  vi.resetAllMocks();
  rpc.mockResolvedValue({ data: payload(), error: null });
});

describe("ledger health server permissions and result binding", () => {
  it("requires the accounting.view permission before making a privileged RPC", async () => {
    await expect(call()).resolves.toMatchObject({ report: { overall: "pass" } });
    expect(assertCompanyPermission).toHaveBeenCalledWith(
      expect.anything(),
      companyId,
      "accounting.view",
    );
    expect(rpc).toHaveBeenCalledWith("ledger_health_check", { payload: { company_id: companyId } });
  });
  it("does not call the database when permissions are denied", async () => {
    vi.mocked(assertCompanyPermission).mockRejectedValueOnce(new Error("Denied"));
    await expect(call()).rejects.toThrow("Denied");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects a response containing another tenant's results", async () => {
    rpc.mockResolvedValueOnce({ data: { ...payload(), company_id: foreignCompany }, error: null });
    await expect(call()).rejects.toThrow(/wrong organisation/i);
  });
  it("fails closed on an incomplete database health response", async () => {
    rpc.mockResolvedValueOnce({ data: { ...payload(), checks: [] }, error: null });
    await expect(call()).rejects.toThrow(/no checks/i);
  });
  it("returns an explicit unavailable reason only for a missing installed function", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "Could not find the function public.ledger_health_check in schema cache" },
    });
    await expect(call()).resolves.toHaveProperty("unavailable");
  });
  it("rejects an invalid requested company ID before access or RPC", async () => {
    expect(() => call("not-a-uuid")).toThrow(/Invalid company id/);
    expect(assertCompanyPermission).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});
