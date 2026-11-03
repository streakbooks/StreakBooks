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
vi.mock("@/lib/settings/document-numbering", () => ({
  allocateDocumentNumber: vi.fn(async () => "PO-42"),
}));
vi.mock("@/lib/purchases/accounts", () => ({
  requireAccountInCompany: vi.fn(),
  requireApControlAccount: vi.fn(),
  requireBankAccount: vi.fn(),
  loadBankGlAccountIds: vi.fn(),
}));
import {
  changePurchaseOrderStatus,
  convertPurchaseOrderToBill,
  getPurchaseOrder,
  savePurchaseOrder,
} from "./purchases.functions";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { requireAccountInCompany } from "./accounts";
const companyId = "11111111-1111-4111-8111-111111111111";
const orderId = "22222222-2222-4222-8222-222222222222";
const billId = "33333333-3333-4333-8333-333333333333";
const accountId = "44444444-4444-4444-8444-444444444444";
type Call = {
  table: string;
  operation: string;
  filters: Array<[string, string, unknown]>;
  payload?: unknown;
};
let calls: Call[];
let current: Record<string, unknown> | null;
let loseRace: boolean;
let lineError: boolean;
const rpc = vi.fn(async () => ({ data: null, error: null }));
const from = vi.fn((table: string) => {
  const call: Call = { table, operation: "select", filters: [] };
  calls.push(call);
  const q = {
    select() {
      return q;
    },
    insert(payload: unknown) {
      call.operation = "insert";
      call.payload = payload;
      return q;
    },
    update(payload: unknown) {
      call.operation = "update";
      call.payload = payload;
      return q;
    },
    delete() {
      call.operation = "delete";
      return q;
    },
    eq(column: string, value: unknown) {
      call.filters.push(["eq", column, value]);
      return q;
    },
    is(column: string, value: unknown) {
      call.filters.push(["is", column, value]);
      return q;
    },
    maybeSingle() {
      return q;
    },
    single() {
      return q;
    },
    in() {
      return q;
    },
    then(resolve: (value: unknown) => unknown) {
      const error =
        lineError && call.operation === "insert" && table.endsWith("_lines")
          ? { message: "line rejected" }
          : null;
      const data =
        call.operation === "update"
          ? loseRace
            ? []
            : [{ id: orderId }]
          : call.operation === "insert"
            ? { id: table === "purchase_bills" ? billId : orderId }
            : table === "contacts"
              ? { id: accountId, payment_terms_days: 14 }
              : current;
      return Promise.resolve(resolve({ data, error }));
    },
  };
  return q;
});
const run = (fn: unknown, data: unknown) =>
  (fn as (args: unknown) => Promise<unknown>)({
    data,
    context: {
      supabase: { from, rpc, auth: { getUser: async () => ({ data: { user: null } }) } },
      userId: accountId,
    },
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(assertCompanyPermission).mockResolvedValue(undefined);
  vi.mocked(requireAccountInCompany).mockResolvedValue(undefined);
  calls = [];
  loseRace = false;
  lineError = false;
  current = {
    status: "draft",
    billed_bill_id: null,
    order_number: "PO-1",
    contact_id: accountId,
    order_date: "2026-11-03",
    currency_code: "GBP",
    memo: null,
    subtotal_minor: 9000,
    tax_minor: 1800,
    total_minor: 10800,
    purchase_order_lines: [
      {
        description: "Item",
        account_id: accountId,
        quantity: 2,
        unit_price_minor: 5000,
        net_minor: 9000,
        tax_rate_bps: 2000,
        tax_minor: 1800,
        line_no: 1,
      },
    ],
  };
});
describe("purchase order authority and lifecycle", () => {
  it.each([
    getPurchaseOrder,
    changePurchaseOrderStatus,
    convertPurchaseOrderToBill,
    savePurchaseOrder,
  ])("checks permission before accessing any tables", async (fn) => {
    vi.mocked(assertCompanyPermission).mockRejectedValueOnce(new Error("Denied"));
    await expect(
      run(fn, {
        companyId,
        orderId,
        status: "sent",
        contactId: accountId,
        orderDate: "2026-11-03",
        currencyCode: "GBP",
        lines: [{ description: "Item", accountId, quantity: 1, unitPriceMinor: 100 }],
      }),
    ).rejects.toThrow("Denied");
    expect(from).not.toHaveBeenCalled();
  });
  it("scopes detail reads by tenant and order", async () => {
    await run(getPurchaseOrder, { companyId, orderId });
    expect(assertCompanyPermission).toHaveBeenCalledWith(
      expect.anything(),
      companyId,
      "purchases.view",
    );
    expect(calls[0]?.filters).toEqual([
      ["eq", "company_id", companyId],
      ["eq", "id", orderId],
      ["eq", "purchase_order_lines.company_id", companyId],
    ]);
  });
  it("rejects inaccessible orders", async () => {
    current = null;
    await expect(run(getPurchaseOrder, { companyId, orderId })).rejects.toThrow("not found");
  });
  it("changes an eligible order with tenant and previous-state guards and records audit", async () => {
    await run(changePurchaseOrderStatus, { companyId, orderId, status: "sent" });
    expect(calls.find((c) => c.operation === "update")?.filters).toEqual([
      ["eq", "company_id", companyId],
      ["eq", "id", orderId],
      ["eq", "status", "draft"],
      ["is", "billed_bill_id", null],
    ]);
    expect(rpc).toHaveBeenCalledWith(
      "record_audit_event",
      expect.objectContaining({
        _entity_id: orderId,
        _entity_type: "purchase_order",
        _details: expect.objectContaining({ from: "draft", to: "sent" }),
      }),
    );
  });
  it("rejects a concurrent conversion or cancellation without a success audit", async () => {
    loseRace = true;
    await expect(
      run(changePurchaseOrderStatus, { companyId, orderId, status: "cancelled" }),
    ).rejects.toThrow("changed");
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each(["billed", "cancelled", "partially_received"])(
    "does not mutate %s orders",
    async (status) => {
      current!["status"] = status;
      await expect(
        run(changePurchaseOrderStatus, { companyId, orderId, status: "cancelled" }),
      ).rejects.toThrow("no longer");
      expect(calls.some((c) => c.operation === "update")).toBe(false);
    },
  );
  it("rejects unsupported statuses before access", async () => {
    await expect(
      run(changePurchaseOrderStatus, { companyId, orderId, status: "billed" }),
    ).rejects.toThrow("Invalid");
    expect(from).not.toHaveBeenCalled();
  });
  it("conversion preserves the discount and supplier terms without posting", async () => {
    expect(await run(convertPurchaseOrderToBill, { companyId, orderId })).toEqual({ billId });
    expect(
      calls.find((c) => c.table === "purchase_bills" && c.operation === "insert")?.payload,
    ).toEqual(
      expect.objectContaining({
        due_date: "2026-11-17",
        status: "draft",
        purchase_order_id: orderId,
      }),
    );
    expect(
      calls.find((c) => c.table === "purchase_bill_lines" && c.operation === "insert")?.payload,
    ).toEqual([
      expect.objectContaining({ discount_minor: 1000, net_minor: 9000, tax_minor: 1800 }),
    ]);
    expect(calls.find((c) => c.operation === "update")?.filters).toContainEqual([
      "eq",
      "status",
      "draft",
    ]);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("removes a provisional draft bill when a concurrent order change wins", async () => {
    loseRace = true;
    await expect(run(convertPurchaseOrderToBill, { companyId, orderId })).rejects.toThrow(
      "changed",
    );
    expect(calls.filter((c) => c.operation === "delete").map((c) => c.table)).toEqual([
      "purchase_bill_lines",
      "purchase_bills",
    ]);
  });
  it("saves multiple ordered lines, validates accounts and sums exact totals", async () => {
    await run(savePurchaseOrder, {
      companyId,
      contactId: accountId,
      orderDate: "2026-11-03",
      currencyCode: "gbp",
      lines: [1, 2].map((quantity) => ({
        description: "Item",
        accountId,
        quantity,
        unitPriceMinor: 5000,
        discountMinor: 1000,
        taxRateBps: 2000,
      })),
    });
    expect(requireAccountInCompany).toHaveBeenCalledTimes(1);
    expect(
      calls.find((c) => c.table === "purchase_orders" && c.operation === "insert")?.payload,
    ).toEqual(
      expect.objectContaining({
        currency_code: "GBP",
        subtotal_minor: 13000,
        tax_minor: 2600,
        total_minor: 15600,
      }),
    );
    expect(
      calls.find((c) => c.table === "purchase_order_lines" && c.operation === "insert")?.payload,
    ).toEqual([
      expect.objectContaining({ line_no: 1, net_minor: 4000 }),
      expect.objectContaining({ line_no: 2, net_minor: 9000 }),
    ]);
  });
  it("cleans up the draft header after a failed line insert", async () => {
    lineError = true;
    await expect(
      run(savePurchaseOrder, {
        companyId,
        contactId: accountId,
        orderDate: "2026-11-03",
        currencyCode: "GBP",
        lines: [{ description: "Item", accountId, quantity: 1, unitPriceMinor: 100 }],
      }),
    ).rejects.toThrow("line rejected");
    expect(calls.find((c) => c.operation === "delete")?.filters).toContainEqual([
      "eq",
      "status",
      "draft",
    ]);
    expect(rpc).not.toHaveBeenCalled();
  });
});
