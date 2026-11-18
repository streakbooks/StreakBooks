import { describe, expect, it } from "vitest";
import { assertExpenseVoidDate } from "@/lib/purchases/expense-void";

describe("assertExpenseVoidDate", () => {
  it("accepts void date on or after the expense date through today", () => {
    expect(
      assertExpenseVoidDate({
        expenseDate: "2026-11-01",
        voidDate: "2026-11-10",
        today: "2026-11-17",
      }),
    ).toBe("2026-11-10");
  });

  it("rejects void before expense date or in the future", () => {
    expect(() =>
      assertExpenseVoidDate({
        expenseDate: "2026-11-10",
        voidDate: "2026-11-01",
        today: "2026-11-17",
      }),
    ).toThrow(/before the expense date/i);
    expect(() =>
      assertExpenseVoidDate({
        expenseDate: "2026-11-01",
        voidDate: "2026-11-20",
        today: "2026-11-17",
      }),
    ).toThrow(/future/i);
  });
});
