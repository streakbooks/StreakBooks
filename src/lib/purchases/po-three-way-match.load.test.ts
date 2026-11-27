import { describe, expect, it, vi } from "vitest";
import { loadBillThreeWayMatch, loadThreeWayMatchingRequired } from "./po-three-way-match.load";
const bill = { id: "bill", purchase_order_id: "order", purchase_bill_lines: [] };

function purchasesSettingsClient(data: unknown, error: { message: string } | null = null) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  };
  return { from: vi.fn(() => query), query };
}

describe("purchase-order three-way-match setting", () => {
  it("uses the safe default when no organisation configuration exists", async () => {
    const client = purchasesSettingsClient(null);
    await expect(loadThreeWayMatchingRequired(client as never, "company")).resolves.toBe(false);
    expect(client.from).toHaveBeenCalledWith("organisation_config");
    expect(client.query.eq).toHaveBeenCalledWith("category", "purchases");
  });

  it("requires matching when the saved purchase settings enable it", async () => {
    const client = purchasesSettingsClient({ document: { three_way_matching: true } });
    await expect(loadThreeWayMatchingRequired(client as never, "company")).resolves.toBe(true);
  });

  it("fails closed when the saved purchase settings are malformed", async () => {
    const client = purchasesSettingsClient({
      document: { three_way_matching: true, bills_inbox_enabled: "yes" },
    });
    await expect(loadThreeWayMatchingRequired(client as never, "company")).rejects.toThrow(
      /Saved Purchases settings are invalid/,
    );
  });

  it("propagates configuration read failures instead of disabling the control", async () => {
    const client = purchasesSettingsClient(null, { message: "permission denied" });
    await expect(loadThreeWayMatchingRequired(client as never, "company")).rejects.toThrow(
      "permission denied",
    );
  });
});

describe("persisted PO bill match loader", () => {
  it("uses cumulative stable-source database validation for persisted bills", async () => {
    const verdict = { applicable: true, status: "pass", issues: [], lines: [], totals: {} };
    const rpc = vi.fn().mockResolvedValue({ data: verdict, error: null });
    const from = vi.fn();
    expect(await loadBillThreeWayMatch({ rpc, from } as never, "company", bill)).toEqual(verdict);
    expect(rpc).toHaveBeenCalledWith("validate_purchase_order_bill", {
      _company: "company",
      _bill: "bill",
    });
    expect(from).not.toHaveBeenCalled();
  });
  it("fails closed when the database migration is missing", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { code: "PGRST202", message: "missing" } });
    await expect(loadBillThreeWayMatch({ rpc } as never, "company", bill)).rejects.toThrow(
      /migration/,
    );
  });
  it("keeps standalone bills outside PO matching", async () => {
    const rpc = vi.fn();
    expect(
      (
        await loadBillThreeWayMatch({ rpc } as never, "company", {
          ...bill,
          purchase_order_id: null,
        })
      ).status,
    ).toBe("na");
    expect(rpc).not.toHaveBeenCalled();
  });
});
