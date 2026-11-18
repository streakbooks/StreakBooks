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
  updatePurchaseOrderBillDetails,
  deleteDraftBill,
  submitBillForApproval,
  rejectBillApproval,
  authoriseBill,
  voidBill,
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
const q = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), update: vi.fn(), is: vi.fn() };
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
  q.update.mockReturnValue(q);
  q.is.mockReturnValue(q);
  q.maybeSingle.mockResolvedValue({ data: { id: orderId }, error: null });
  rpc.mockResolvedValue({
    data: { id: orderId, orderNumber: "PO-1", version: 1, billId: orderId },
    error: null,
  });
});

describe("purchase-order bill controls", () => {
  it("authorises PO bills in the database transaction that posts and links the journal", async () => {
    q.maybeSingle.mockResolvedValueOnce({
      data: { id: orderId, status: "draft", purchase_order_id: requestId },
      error: null,
    });
    await run(authoriseBill, { companyId, billId: orderId });
    expect(rpc).toHaveBeenCalledWith("authorise_purchase_order_bill_atomic", {
      _company: companyId,
      _bill: orderId,
    });
    expect(q.update).not.toHaveBeenCalled();
  });
  it("voids linked bills atomically with their reversal and quantity release", async () => {
    q.maybeSingle.mockResolvedValueOnce({
      data: {
        id: orderId,
        status: "authorised",
        purchase_order_id: requestId,
        bill_date: "2026-11-01",
        posted_journal_id: accountId,
        amount_paid_minor: 0,
        amount_credited_minor: 0,
      },
      error: null,
    });
    await run(voidBill, {
      companyId,
      billId: orderId,
      reason: "Returned goods",
      voidDate: "2026-11-18",
    });
    expect(rpc).toHaveBeenCalledWith("void_purchase_order_bill_atomic", {
      _company: companyId,
      _bill: orderId,
      _reason: "Returned goods",
      _date: "2026-11-18",
    });
    expect(q.update).not.toHaveBeenCalled();
  });
  it.each([
    [submitBillForApproval, "draft"],
    [rejectBillApproval, "awaiting_approval"],
  ] as const)("rejects stale bill approval changes", async (fn, status) => {
    q.maybeSingle.mockResolvedValueOnce({ data: { id: orderId, status }, error: null });
    q.select.mockImplementation((columns: string) =>
      columns === "id" ? Promise.resolve({ data: [], error: null }) : q,
    );
    await expect(run(fn, { companyId, billId: orderId })).rejects.toThrow("changed");
    expect(q.eq).toHaveBeenCalledWith("status", status);
    expect(q.is).toHaveBeenCalledWith("posted_journal_id", null);
    expect(rpc).not.toHaveBeenCalled();
  });
  const details = {
    companyId,
    billId: orderId,
    billDate: "2026-11-18",
    dueDate: "2026-12-18",
    supplierInvoiceNumber: " INV-1 ",
    memo: "Received goods",
    fxRateToBase: 1.2,
    expectedUpdatedAt: "2026-11-18T01:00:00Z",
  };
  it("sends only invoice metadata to the atomic header endpoint", async () => {
    await run(updatePurchaseOrderBillDetails, details);
    expect(rpc).toHaveBeenCalledWith("update_po_bill_details", {
      _company: companyId,
      _bill: orderId,
      _payload: expect.objectContaining({
        supplierInvoiceNumber: "INV-1",
        expectedUpdatedAt: details.expectedUpdatedAt,
      }),
    });
    expect(from).not.toHaveBeenCalled();
    expect(rpc.mock.calls[0]![1]._payload).not.toHaveProperty("lines");
  });
  it("denies header updates before database access", async () => {
    vi.mocked(assertCompanyPermission).mockRejectedValueOnce(new Error("Denied"));
    await expect(run(updatePurchaseOrderBillDetails, details)).rejects.toThrow("Denied");
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([
    { billDate: "2026-02-30" },
    { dueDate: "invalid" },
    { fxRateToBase: -1 },
    { fxRateToBase: Number.NaN },
    { expectedUpdatedAt: "" },
  ])("rejects invalid header values before writes", async (invalid) => {
    await expect(run(updatePurchaseOrderBillDetails, { ...details, ...invalid })).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("deletes a linked draft through the transaction that releases its quantities", async () => {
    q.maybeSingle.mockResolvedValueOnce({
      data: { id: orderId, status: "draft", posted_journal_id: null, purchase_order_id: requestId },
      error: null,
    });
    await run(deleteDraftBill, { companyId, billId: orderId });
    expect(rpc).toHaveBeenCalledWith("delete_purchase_order_bill_atomic", {
      _company: companyId,
      _bill: orderId,
    });
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
