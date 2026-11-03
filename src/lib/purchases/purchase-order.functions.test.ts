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
vi.mock("@/lib/assert-company-access", () => ({
  assertCompanyPermission: vi.fn(),
  assertCompanyMember: vi.fn(),
}));
import {
  savePurchaseOrder,
  convertPurchaseOrderToBill,
  changePurchaseOrderStatus,
  getPurchaseOrder,
  listPurchaseOrders,
} from "./purchases.functions";
import { assertCompanyPermission } from "@/lib/assert-company-access";
const companyId = "11111111-1111-4111-8111-111111111111",
  orderId = "22222222-2222-4222-8222-222222222222",
  accountId = "33333333-3333-4333-8333-333333333333",
  requestId = "44444444-4444-4444-8444-444444444444";
const input = {
  companyId,
  contactId: accountId,
  orderDate: "2026-11-03",
  currencyCode: "gbp",
  requestId,
  lines: [
    {
      description: "Item",
      accountId,
      quantity: 1.5,
      unitPriceMinor: 1001,
      discountMinor: 0,
      taxRateBps: 0,
    },
  ],
};
const rpc = vi.fn();
const q = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
const from = vi.fn(() => q);
const run = (fn: unknown, data: unknown) =>
  (fn as (args: unknown) => Promise<unknown>)({
    data,
    context: { supabase: { rpc, from }, userId: accountId },
  });
beforeEach(() => {
  vi.resetAllMocks();
  from.mockReturnValue(q);
  q.select.mockReturnValue(q);
  q.eq.mockReturnValue(q);
  q.maybeSingle.mockResolvedValue({ data: { id: orderId }, error: null });
  rpc.mockResolvedValue({
    data: { id: orderId, orderNumber: "PO-1", version: 1, billId: orderId },
    error: null,
  });
});
describe("transactional purchase order API", () => {
  it.each([
    savePurchaseOrder,
    convertPurchaseOrderToBill,
    changePurchaseOrderStatus,
    getPurchaseOrder,
    listPurchaseOrders,
  ])("denies access before any database operation", async (fn) => {
    vi.mocked(assertCompanyPermission).mockRejectedValueOnce(new Error("Denied"));
    await expect(run(fn, { ...input, orderId, version: 1, status: "sent" })).rejects.toThrow(
      "Denied",
    );
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("passes plain validated input and the stable request ID to the atomic save", async () => {
    await run(savePurchaseOrder, input);
    expect(rpc).toHaveBeenCalledWith("save_purchase_order_atomic", {
      _company: companyId,
      _payload: expect.objectContaining({ requestId, currencyCode: "GBP", lines: input.lines }),
    });
    expect(from).not.toHaveBeenCalled();
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("net_minor");
  });
  it("requires a version when editing an existing draft", async () => {
    await expect(run(savePurchaseOrder, { ...input, orderId })).rejects.toThrow("Reload");
    expect(rpc).not.toHaveBeenCalled();
    await run(savePurchaseOrder, { ...input, orderId, version: 3 });
    expect(rpc).toHaveBeenCalledWith(
      "save_purchase_order_atomic",
      expect.objectContaining({ _payload: expect.objectContaining({ orderId, version: 3 }) }),
    );
  });
  it("uses atomic conversion with no provisional application-side writes", async () => {
    await run(convertPurchaseOrderToBill, { companyId, orderId });
    expect(rpc).toHaveBeenCalledWith("convert_purchase_order_atomic", {
      _company: companyId,
      _order: orderId,
    });
    expect(from).not.toHaveBeenCalled();
  });
  it("records status and audit in one RPC", async () => {
    await run(changePurchaseOrderStatus, { companyId, orderId, status: "cancelled" });
    expect(rpc).toHaveBeenCalledWith("change_purchase_order_atomic", {
      _company: companyId,
      _order: orderId,
      _status: "cancelled",
    });
  });
  it("fails clearly if the migration is absent, without a nontransactional fallback", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "missing" } });
    await expect(run(savePurchaseOrder, input)).rejects.toThrow("migration");
    expect(from).not.toHaveBeenCalled();
  });
  it("preserves conflict errors raised by the database", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "40001", message: "Order changed; reload before saving" },
    });
    await expect(run(savePurchaseOrder, input)).rejects.toThrow("Order changed");
  });
  it("scopes detail and embedded lines by tenant", async () => {
    await run(getPurchaseOrder, { companyId, orderId });
    expect(q.eq).toHaveBeenCalledWith("company_id", companyId);
    expect(q.eq).toHaveBeenCalledWith("purchase_order_lines.company_id", companyId);
  });
  it("uses server pagination and search rather than filtering a capped array", async () => {
    await run(listPurchaseOrders, { companyId, q: "supplier %", status: "sent", page: 3 });
    expect(rpc).toHaveBeenCalledWith("browse_purchase_orders", {
      _company: companyId,
      _search: "supplier %",
      _status: "sent",
      _page: 3,
      _size: 25,
    });
  });
  it("rejects invalid request identities and lifecycle statuses", async () => {
    await expect(run(savePurchaseOrder, { ...input, requestId: "bad" })).rejects.toThrow("Invalid");
    await expect(
      run(changePurchaseOrderStatus, { companyId, orderId, status: "billed" }),
    ).rejects.toThrow("Invalid");
    expect(rpc).not.toHaveBeenCalled();
  });
});
