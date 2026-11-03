import { describe, expect, it, vi } from "vitest";
import { loadDepreciationExpenseAccounts } from "./depreciation-accounts.server";
import type { Sb } from "@/lib/accounting/ledger-data";

describe("indirect cash-flow depreciation sources", () => {
  it("includes accounts first appearing after 1,000 assets and keeps tenant and stable ordering", async () => {
    const rows = Array.from({ length: 1001 }, (_, index) => ({
      id: String(index),
      expense_account_id: index === 1000 ? "late-expense-account" : "usual-expense-account",
    }));
    const query = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn() };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.order.mockReturnValue(query);
    query.range.mockImplementation(async (from: number, to: number) => ({
      data: rows.slice(from, to + 1),
      error: null,
    }));
    const from = vi.fn().mockReturnValue(query);
    expect(await loadDepreciationExpenseAccounts({ from } as unknown as Sb, "company-id")).toEqual([
      "usual-expense-account",
      "late-expense-account",
    ]);
    expect(from).toHaveBeenCalledWith("fixed_assets");
    expect(query.eq).toHaveBeenCalledWith("company_id", "company-id");
    expect(query.order).toHaveBeenCalledWith("id");
    expect(query.range).toHaveBeenCalledTimes(3);
  });
  it("fails explicitly on data-access errors instead of silently omitting noncash adjustments", async () => {
    const query = {
      select() {
        return this;
      },
      eq() {
        return this;
      },
      order() {
        return this;
      },
      async range() {
        return { data: null, error: { message: "Depreciation source unavailable" } };
      },
    };
    await expect(
      loadDepreciationExpenseAccounts({ from: () => query } as unknown as Sb, "company-id"),
    ).rejects.toThrow("Depreciation source unavailable");
  });
});
