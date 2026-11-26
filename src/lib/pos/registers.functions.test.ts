import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validate = (input: unknown): unknown => input;
    const chain = {
      middleware() {
        return chain;
      },
      validator(fn: typeof validate) {
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
import {
  getPosWorkspace,
  createPosRegister,
  openPosSession,
  closePosSession,
  setPosLocationAccess,
} from "./registers.functions";
const id = "11111111-1111-4111-8111-111111111111";
const rpc = vi.fn();
const run = (fn: unknown, data: unknown) =>
  (fn as (args: unknown) => Promise<unknown>)({ data, context: { supabase: { rpc } } });
const session = { companyId: id, targetId: id, operationId: id, amountMinor: "9007199254740993" };
const workspace = {
  userId: id,
  currency: "USD",
  registers: [],
  openSessions: [],
  recentSessions: [],
  locations: [],
  cashAccounts: [],
  members: [],
  locationAccess: [],
  canManage: true,
  canOpen: true,
  canClose: true,
  canSell: true,
  canAdjustCash: true,
  canRefund: true,
};
beforeEach(() => {
  vi.resetAllMocks();
  rpc.mockResolvedValue({ data: id, error: null });
});
describe("POS register server boundary (mocked database)", () => {
  it("checks open permission before RPC and preserves exact money/operation identity", async () => {
    await expect(run(openPosSession, session)).resolves.toEqual({ id });
    expect(assertCompanyPermission).toHaveBeenCalledWith(
      expect.anything(),
      id,
      "pos.register.open",
    );
    expect(rpc).toHaveBeenCalledWith("pos_open_session", {
      _company_id: id,
      _register_id: id,
      _operation_id: id,
      _opening_float_minor: "9007199254740993",
    });
  });
  it("requires both close and count permissions before issuing a close", async () => {
    vi.mocked(assertCompanyPermission)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Count denied"));
    await expect(run(closePosSession, session)).rejects.toThrow("Count denied");
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([getPosWorkspace, openPosSession, closePosSession])(
    "denial prevents database command",
    async (fn) => {
      vi.mocked(assertCompanyPermission).mockRejectedValueOnce(new Error("Denied"));
      await expect(run(fn, session)).rejects.toThrow("Denied");
      expect(rpc).not.toHaveBeenCalled();
    },
  );
  it("maps validated setup/access commands to existing-company RPCs", async () => {
    await run(createPosRegister, {
      companyId: id,
      registerId: id,
      locationId: id,
      cashAccountId: id,
      code: " counter ",
      name: " Front ",
    });
    expect(rpc).toHaveBeenCalledWith("pos_create_register", {
      _company_id: id,
      _register_id: id,
      _location_id: id,
      _cash_account_id: id,
      _code: "COUNTER",
      _name: "Front",
    });
    await run(setPosLocationAccess, { companyId: id, locationId: id, userId: id, allowed: false });
    expect(rpc).toHaveBeenLastCalledWith("pos_set_location_access", {
      _company_id: id,
      _location_id: id,
      _user_id: id,
      _allowed: false,
    });
  });
  it("validates workspace responses instead of accepting malformed database data", async () => {
    rpc.mockResolvedValueOnce({ data: workspace, error: null });
    await expect(run(getPosWorkspace, { companyId: id })).resolves.toEqual(workspace);
    rpc.mockResolvedValueOnce({ data: { ...workspace, currency: null }, error: null });
    await expect(run(getPosWorkspace, { companyId: id })).rejects.toThrow();
  });
  it("reports a missing migration and does not fall back to client-only persistence", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "Missing" } });
    await expect(run(openPosSession, session)).rejects.toThrow(/database upgrade/);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("propagates server exceptions and rejects a missing durable result", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "22023", message: "Variance" } });
    await expect(run(closePosSession, session)).rejects.toThrow("Variance");
    rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(run(openPosSession, session)).rejects.toThrow(/id/);
  });
  it("rejects numeric amounts and missing target IDs before authentication/database checks", () => {
    expect(() => run(openPosSession, { ...session, amountMinor: 100 })).toThrow();
    expect(() => run(closePosSession, { ...session, targetId: "bad" })).toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
});
