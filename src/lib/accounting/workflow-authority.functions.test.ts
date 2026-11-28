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
vi.mock("@/lib/sales/sales-common", () => ({
  loadCompanyDefaults: async () => ({ baseCurrency: "GBP", today: "2026-11-03", timezone: "UTC" }),
}));
import { createDeferral, postDeferral, cancelDeferral, listDeferrals } from "./deferrals.functions";
import {
  saveSalesOrder,
  actSalesOrder,
  listSalesOrders,
  getSalesOrder,
} from "@/lib/sales/sales-orders.functions";
import { assertCompanyPermission } from "@/lib/assert-company-access";
const id = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
const data = {
  companyId: id,
  requestId: other,
  kind: "prepaid_expense",
  name: "Prepayment",
  reference: "Original bill",
  debitAccountId: id,
  creditAccountId: other,
  totalMinor: 10000,
  startDate: "2026-01-31",
  periods: 12,
  entryId: id,
  postingDate: "2026-11-03",
  scheduleId: id,
  contactId: id,
  orderDate: "2026-11-03",
  currencyCode: "GBP",
  fxRate: 1,
  memo: "",
  lines: [{ description: "Item", accountId: id, quantity: 1, unitPriceMinor: 100 }],
  orderId: id,
  version: 1,
  action: "confirm",
};
const rpc = vi.fn();
const q = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn(), maybeSingle: vi.fn() };
const from = vi.fn(() => q);
const run = (fn: unknown, input: unknown = data) =>
  (fn as (args: unknown) => Promise<unknown>)({
    data: input,
    context: { supabase: { rpc, from } },
  });
beforeEach(() => {
  vi.resetAllMocks();
  from.mockReturnValue(q);
  for (const fn of [q.select, q.eq, q.order]) fn.mockReturnValue(q);
  q.range.mockResolvedValue({ data: [], error: null, count: 0 });
  q.maybeSingle.mockResolvedValue({ data: { id }, error: null });
  rpc.mockResolvedValue({ data: { id }, error: null });
});
describe("sales and accounting workflow authority", () => {
  it.each([
    createDeferral,
    postDeferral,
    cancelDeferral,
    listDeferrals,
    saveSalesOrder,
    actSalesOrder,
    listSalesOrders,
    getSalesOrder,
  ])("rejects unauthorized reads and mutations before accessing tables/RPCs", async (fn) => {
    vi.mocked(assertCompanyPermission).mockRejectedValueOnce(new Error("Denied"));
    await expect(run(fn)).rejects.toThrow("Denied");
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("requires accounting.post and passes a validated recognition date", async () => {
    await run(postDeferral);
    expect(assertCompanyPermission).toHaveBeenCalledWith(expect.anything(), id, "accounting.post");
    expect(rpc).toHaveBeenCalledWith("post_deferral_entry", {
      _company: id,
      _entry: id,
      _posting_date: "2026-11-03",
    });
  });
  it("does not allow a zero amount, invalid date or account identity", async () => {
    await expect(run(createDeferral, { ...data, totalMinor: 0 })).rejects.toThrow();
    await expect(run(postDeferral, { ...data, postingDate: "2026-02-30" })).rejects.toThrow();
    await expect(run(createDeferral, { ...data, creditAccountId: id })).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("scopes schedules and embedded entries by company and uses bounded pages", async () => {
    await run(listDeferrals, { companyId: id, page: 2 });
    expect(q.eq).toHaveBeenCalledWith("company_id", id);
    expect(q.eq).toHaveBeenCalledWith("deferral_entries.company_id", id);
    expect(q.range).toHaveBeenCalledWith(25, 49);
  });
  it("creates sales orders without posting accounting journals", async () => {
    await run(saveSalesOrder);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("save_sales_order", {
      _company: id,
      _payload: expect.objectContaining({ requestId: other, contactId: id }),
    });
  });
  it("preserves an explicit sales invoice date and expected order version", async () => {
    await run(actSalesOrder, { ...data, action: "invoice", invoiceDate: "2026-11-03" });
    expect(rpc).toHaveBeenCalledWith("act_sales_order", {
      _company: id,
      _order: id,
      _version: 1,
      _action: "invoice",
      _invoice_date: "2026-11-03",
    });
  });
  it("rejects stale/unsupported action metadata before calling SQL", async () => {
    await expect(run(actSalesOrder, { ...data, version: 0 })).rejects.toThrow();
    await expect(run(actSalesOrder, { ...data, action: "post" })).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
});
