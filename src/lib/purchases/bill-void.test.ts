import { describe, expect, it } from "vitest";
import { assertBillVoidDate } from "./bill-void";

describe("assertBillVoidDate", () => {
  it("accepts a void date on or after the bill date up to today", () => {
    expect(
      assertBillVoidDate({ billDate: "2026-01-10", voidDate: "2026-01-10", today: "2026-11-17" }),
    ).toBe("2026-01-10");
    expect(
      assertBillVoidDate({ billDate: "2026-01-10", voidDate: "2026-03-01", today: "2026-11-17" }),
    ).toBe("2026-03-01");
  });

  it("rejects dates before the bill or after today", () => {
    expect(() =>
      assertBillVoidDate({ billDate: "2026-01-10", voidDate: "2026-01-09", today: "2026-11-17" }),
    ).toThrow(/before the bill date/);
    expect(() =>
      assertBillVoidDate({ billDate: "2026-01-10", voidDate: "2026-11-18", today: "2026-11-17" }),
    ).toThrow(/future/);
  });
});
