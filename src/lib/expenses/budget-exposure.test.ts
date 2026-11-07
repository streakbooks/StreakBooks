import { describe, expect, it } from "vitest";
import { isBudgetOverExposed, mapExpenseBudgetExposure } from "./budget-exposure";

describe("expense budget exposure", () => {
  it("maps exposure rows and detects overspend", () => {
    const mapped = mapExpenseBudgetExposure({
      as_of: "2026-11-07",
      period_month: "2026-11-01",
      rows: [
        {
          account_id: "a1",
          account_code: "6000",
          account_name: "Travel",
          budget_id: "b1",
          budget_name: "FY26",
          period_month: "2026-11-01",
          budget_amount_minor: 10000,
          open_claim_minor: 12000,
        },
      ],
    });
    expect(mapped.rows[0]?.accountCode).toBe("6000");
    expect(isBudgetOverExposed(mapped.rows[0]!)).toBe(true);
  });
});
