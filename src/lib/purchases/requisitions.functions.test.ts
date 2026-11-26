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
  listPurchaseRequisitions,
  managePurchaseRequisition,
  savePurchaseRequisition,
} from "./requisitions.functions";
const companyId = "11111111-1111-4111-8111-111111111111",
  id = "22222222-2222-4222-8222-222222222222",
  contactId = "33333333-3333-4333-8333-333333333333";
const input = {
  companyId,
  requestId: id,
  title: "Computer replacement",
  contactId,
  requestedOn: "2026-11-18",
  currencyCode: "gbp",
  lines: [
    {
      description: "Computer",
      accountId: contactId,
      quantity: 2,
      unitPriceMinor: 10000,
      discountMinor: 1,
      taxRateBps: 2000,
    },
  ],
};
const rpc = vi.fn();
const run = (fn: unknown, data: unknown) =>
  (fn as (args: unknown) => Promise<unknown>)({
    data,
    context: { supabase: { rpc }, userId: contactId },
  });
beforeEach(() => {
  vi.resetAllMocks();
  rpc.mockResolvedValue({ data: { id }, error: null });
});
describe("purchase requisition APIs", () => {
  it.each([listPurchaseRequisitions, savePurchaseRequisition, managePurchaseRequisition])(
    "requires permission before database access",
    async (fn) => {
      vi.mocked(assertCompanyPermission).mockRejectedValueOnce(new Error("Denied"));
      await expect(run(fn, { ...input, id, version: 1, action: "submit" })).rejects.toThrow(
        "Denied",
      );
      expect(rpc).not.toHaveBeenCalled();
    },
  );
  it("sends validated plain lines and stable request key to atomic save", async () => {
    await run(savePurchaseRequisition, input);
    expect(rpc).toHaveBeenCalledWith("save_purchase_requisition", {
      _company: companyId,
      _payload: expect.objectContaining({ requestId: id, currencyCode: "GBP", lines: input.lines }),
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("net_minor");
  });
  it("rejects impossible dates, backwards requirements and stale edits", async () => {
    for (const extra of [{ requestedOn: "2026-02-30" }, { requiredOn: "2026-11-17" }, { id }])
      await expect(run(savePurchaseRequisition, { ...input, ...extra })).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each(["approve", "reject"])("requires authorisation permission for %s", async (action) => {
    await run(managePurchaseRequisition, {
      companyId,
      id,
      version: 3,
      action,
      comment: "Budget decision",
    });
    expect(assertCompanyPermission).toHaveBeenCalledWith(
      expect.anything(),
      companyId,
      "purchases.authorise",
    );
    expect(rpc).toHaveBeenCalledWith(
      "manage_purchase_requisition",
      expect.objectContaining({ _id: id, _version: 3, _action: action }),
    );
  });
  it("rejects unknown actions and rejection without reason", async () => {
    await expect(
      run(managePurchaseRequisition, { companyId, id, version: 1, action: "ordered" }),
    ).rejects.toThrow("Invalid");
    await expect(
      run(managePurchaseRequisition, { companyId, id, version: 1, action: "reject", comment: " " }),
    ).rejects.toThrow("rejection reason");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("preserves database conflict errors", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "40001", message: "Requisition changed; reload first" },
    });
    await expect(
      run(managePurchaseRequisition, { companyId, id, version: 1, action: "submit" }),
    ).rejects.toThrow("reload");
  });
  it("fails closed without schema", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "missing" } });
    await expect(run(savePurchaseRequisition, input)).rejects.toThrow("migration");
  });
  it("passes literal server search and bounded pagination", async () => {
    await run(listPurchaseRequisitions, {
      companyId,
      status: "approved",
      search: "laptop %",
      page: 2,
    });
    expect(rpc).toHaveBeenCalledWith("browse_purchase_requisitions", {
      _company: companyId,
      _status: "approved",
      _search: "laptop %",
      _page: 2,
    });
    await expect(run(listPurchaseRequisitions, { companyId, page: NaN })).rejects.toThrow("page");
  });
});
