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
  completePosCashSale,
  recordPosCashMovement,
  refundPosCashSale,
} from "./cash-sale.functions";

const id = "11111111-1111-4111-8111-111111111111";
const productId = "22222222-2222-4222-8222-222222222222";
const rpc = vi.fn();
const run = (fn: unknown, data: unknown) =>
  (fn as (args: unknown) => Promise<unknown>)({ data, context: { supabase: { rpc } } });
const saleRpc = {
  sale_id: id,
  operation_id: id,
  subtotal_minor: "1000",
  tax_minor: "100",
  total_minor: "1100",
  tendered_minor: "2000",
  change_minor: "900",
  expected_cash_minor: "3100",
  journal_id: productId,
};

beforeEach(() => {
  vi.resetAllMocks();
  rpc.mockResolvedValue({ data: saleRpc, error: null });
  vi.mocked(assertCompanyPermission).mockResolvedValue(undefined);
});

describe("POS cash sale server boundary (mocked database)", () => {
  it("checks sale permission and forwards exact minor strings to RPC", async () => {
    await expect(
      run(completePosCashSale, {
        companyId: id,
        sessionId: id,
        operationId: id,
        cashTenderedMinor: "2000",
        lines: [{ productId, quantity: 1 }],
      }),
    ).resolves.toMatchObject({ grossMinor: "1100", receiptCode: id });
    expect(assertCompanyPermission).toHaveBeenCalledWith(expect.anything(), id, "pos.sale.create");
    expect(rpc).toHaveBeenCalledWith("pos_complete_cash_sale", {
      _company_id: id,
      _session_id: id,
      _operation_id: id,
      _cash_tendered_minor: "2000",
      _lines: [{ product_id: productId, quantity: 1 }],
    });
  });
  it("maps cash movement and refund permissions", async () => {
    rpc.mockResolvedValueOnce({
      data: { movement_id: id, expected_cash_minor: "5000" },
      error: null,
    });
    await run(recordPosCashMovement, {
      companyId: id,
      sessionId: id,
      operationId: id,
      kind: "cash_in",
      amountMinor: "2500",
      note: "Petty top-up",
    });
    expect(assertCompanyPermission).toHaveBeenCalledWith(expect.anything(), id, "pos.cash.adjust");
    rpc.mockResolvedValueOnce({
      data: {
        refund_id: id,
        sale_id: productId,
        amount_minor: "1100",
        expected_cash_minor: "3900",
        journal_id: productId,
      },
      error: null,
    });
    await run(refundPosCashSale, { companyId: id, saleId: productId, operationId: id });
    expect(assertCompanyPermission).toHaveBeenCalledWith(
      expect.anything(),
      id,
      "pos.refund.create",
    );
  });
  it("denies RPC when permission check fails", async () => {
    vi.mocked(assertCompanyPermission).mockRejectedValueOnce(new Error("Denied"));
    await expect(
      run(completePosCashSale, {
        companyId: id,
        sessionId: id,
        operationId: id,
        cashTenderedMinor: "1",
        lines: [{ productId, quantity: 1 }],
      }),
    ).rejects.toThrow("Denied");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("reports a missing migration", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "Missing" } });
    await expect(
      run(completePosCashSale, {
        companyId: id,
        sessionId: id,
        operationId: id,
        cashTenderedMinor: "1",
        lines: [{ productId, quantity: 1 }],
      }),
    ).rejects.toThrow(/database upgrade/);
  });
});
