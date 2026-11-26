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
        return async (args: { data: unknown; context: unknown }) =>
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
  managePurchaseOrder,
  receivePurchaseOrder,
  reversePurchaseReceipt,
  getPurchaseOrderActivity,
} from "./po-controls.functions";
const companyId = "11111111-1111-4111-8111-111111111111",
  orderId = "22222222-2222-4222-8222-222222222222",
  requestId = "33333333-3333-4333-8333-333333333333",
  lineId = "44444444-4444-4444-8444-444444444444";
const rpc = vi.fn();
const run = (fn: unknown, data: unknown) =>
  (fn as (args: unknown) => Promise<unknown>)({
    data,
    context: { supabase: { rpc }, userId: lineId },
  });
beforeEach(() => {
  vi.resetAllMocks();
  rpc.mockResolvedValue({ data: { id: orderId, version: 2 }, error: null });
});
describe("purchase order controls", () => {
  it.each(["approve", "reject"])("requires authorisation permission for %s", async (action) => {
    await run(managePurchaseOrder, {
      companyId,
      orderId,
      version: 1,
      action,
      payload: { comment: "Reviewed" },
    });
    expect(assertCompanyPermission).toHaveBeenCalledWith(
      expect.anything(),
      companyId,
      "purchases.authorise",
    );
    expect(rpc).toHaveBeenCalledWith(
      "manage_purchase_order",
      expect.objectContaining({ _version: 1, _action: action }),
    );
  });
  it("denies actions before issuing a database call", async () => {
    vi.mocked(assertCompanyPermission).mockRejectedValueOnce(new Error("Denied"));
    await expect(
      run(managePurchaseOrder, { companyId, orderId, version: 1, action: "send" }),
    ).rejects.toThrow("Denied");
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([0, NaN, 1.5])("rejects a missing or invalid version %s", async (version) => {
    await expect(
      run(managePurchaseOrder, { companyId, orderId, version, action: "submit" }),
    ).rejects.toThrow("Reload");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("requires an explanation for rejection and cancellation", async () => {
    for (const action of ["reject", "cancel"]) {
      await expect(
        run(managePurchaseOrder, {
          companyId,
          orderId,
          version: 1,
          action,
          payload: { comment: " " },
        }),
      ).rejects.toThrow("reason");
    }
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects malformed metadata dates instead of coercing them", async () => {
    await expect(
      run(managePurchaseOrder, {
        companyId,
        orderId,
        version: 1,
        action: "metadata",
        payload: { expectedDeliveryDate: "2026-02-30" },
      }),
    ).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("preserves omitted metadata and explicitly clears a date", async () => {
    await run(managePurchaseOrder, {
      companyId,
      orderId,
      version: 1,
      action: "metadata",
      payload: { expectedDeliveryDate: "", supplierReference: " SUP-23 " },
    });
    expect(rpc).toHaveBeenCalledWith(
      "manage_purchase_order",
      expect.objectContaining({
        _payload: { expectedDeliveryDate: null, supplierReference: "SUP-23" },
      }),
    );
  });
  const receipt = {
    companyId,
    orderId,
    requestId,
    receiptDate: "2026-11-17",
    reference: "GRN-1",
    lines: [{ lineId, receiveQuantity: 1.5 }],
  };
  it("sends stable receipt identity to one atomic call", async () => {
    await run(receivePurchaseOrder, receipt);
    expect(rpc).toHaveBeenCalledWith("receive_purchase_order", {
      _company: companyId,
      _order: orderId,
      _request: requestId,
      _date: "2026-11-17",
      _reference: "GRN-1",
      _lines: receipt.lines,
    });
  });
  it("rejects duplicate lines before recording a receipt", async () => {
    await expect(
      run(receivePurchaseOrder, { ...receipt, lines: [...receipt.lines, ...receipt.lines] }),
    ).rejects.toThrow("once");
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([0, -1, Infinity, 0.0000001])("rejects receipt quantity %s", async (qty) => {
    await expect(
      run(receivePurchaseOrder, { ...receipt, lines: [{ lineId, receiveQuantity: qty }] }),
    ).rejects.toThrow("positive");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("requires identity and reason for reversal", async () => {
    await run(reversePurchaseReceipt, {
      companyId,
      orderId,
      receiptId: lineId,
      requestId,
      reason: "Damaged goods",
    });
    expect(rpc).toHaveBeenCalledWith("reverse_purchase_receipt", {
      _company: companyId,
      _order: orderId,
      _receipt: lineId,
      _request: requestId,
      _reason: "Damaged goods",
    });
  });
  it("scopes activity reads to tenant permission", async () => {
    await run(getPurchaseOrderActivity, { companyId, orderId });
    expect(assertCompanyPermission).toHaveBeenCalledWith(
      expect.anything(),
      companyId,
      "purchases.view",
    );
    expect(rpc).toHaveBeenCalledWith("get_purchase_order_activity", {
      _company: companyId,
      _order: orderId,
    });
  });
  it("fails closed when migration is not installed", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "missing" } });
    await expect(
      run(managePurchaseOrder, { companyId, orderId, version: 1, action: "submit" }),
    ).rejects.toThrow("migration");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
