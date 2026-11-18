import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let parse: (value: unknown) => unknown = (value) => value;
    return {
      middleware() {
        return this;
      },
      inputValidator(fn: (value: unknown) => unknown) {
        parse = fn;
        return this;
      },
      handler(fn: (input: unknown) => unknown) {
        return (input: { data: unknown; context: unknown }) =>
          fn({ ...input, data: parse(input.data) });
      },
    };
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/assert-company-access", () => ({ assertCompanyPermission: vi.fn() }));
vi.mock("./rpc", () => ({ callRpc: vi.fn() }));
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { callRpc } from "./rpc";
import { recordCodingFeedback, setCodingMemoryPreference } from "./memory.functions";
const companyId = "11111111-1111-4111-8111-111111111111";
const identity = {
  companyId,
  bankTransactionId: "22222222-2222-4222-8222-222222222222",
  historyId: "33333333-3333-4333-8333-333333333333",
};
const context = { supabase: {}, userId: "user" };
const invoke = (fn: unknown, data: unknown) =>
  (fn as (input: unknown) => Promise<unknown>)({ data, context });
beforeEach(() => {
  vi.mocked(assertCompanyPermission).mockReset();
  vi.mocked(callRpc).mockReset();
});
describe("Coding Memory authenticated server mutation boundaries", () => {
  it("rejects malformed or overbroad input before database work", () => {
    expect(() =>
      invoke(recordCodingFeedback, { ...identity, state: "posted", requestId: companyId }),
    ).toThrow();
    expect(() => invoke(setCodingMemoryPreference, { ...identity, enabled: "true" })).toThrow();
    expect(() =>
      invoke(setCodingMemoryPreference, { ...identity, enabled: true, actorId: companyId }),
    ).toThrow();
    expect(callRpc).not.toHaveBeenCalled();
  });
  it("denies revoked permission before a feedback write", async () => {
    vi.mocked(assertCompanyPermission).mockRejectedValueOnce(new Error("Permission revoked"));
    await expect(
      invoke(recordCodingFeedback, { ...identity, state: "rejected", requestId: companyId }),
    ).rejects.toThrow("Permission revoked");
    expect(callRpc).not.toHaveBeenCalled();
  });
  it("forwards stable feedback identity only after both permissions pass", async () => {
    vi.mocked(callRpc).mockResolvedValueOnce("feedback");
    await expect(
      invoke(recordCodingFeedback, { ...identity, state: "rejected", requestId: companyId }),
    ).resolves.toBe("feedback");
    expect(assertCompanyPermission).toHaveBeenCalledWith(
      context.supabase,
      companyId,
      "banking.categorise",
    );
    expect(assertCompanyPermission).toHaveBeenCalledWith(
      context.supabase,
      companyId,
      "banking.view",
    );
    expect(callRpc).toHaveBeenCalledWith(context.supabase, "record_bank_coding_feedback", {
      _company_id: companyId,
      _bank_transaction_id: identity.bankTransactionId,
      _history_id: identity.historyId,
      _state: "rejected",
      _request_id: companyId,
    });
  });
  it("surfaces a preference database failure instead of reporting success", async () => {
    vi.mocked(callRpc).mockRejectedValueOnce(new Error("Database update required"));
    await expect(
      invoke(setCodingMemoryPreference, { ...identity, enabled: false }),
    ).rejects.toThrow("Database update required");
  });
});
