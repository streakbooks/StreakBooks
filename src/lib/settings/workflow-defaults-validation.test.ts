import { describe, expect, it } from "vitest";
import { parsePaymentTermsDays } from "./workflow-defaults-validation";

describe("workflow payment terms validation", () => {
  it("accepts zero days and reasonable whole-day terms", () => {
    expect(parsePaymentTermsDays("0")).toBe(0);
    expect(parsePaymentTermsDays(" 30 ")).toBe(30);
    expect(parsePaymentTermsDays("3650")).toBe(3650);
  });

  it("does not silently replace missing or malformed numbers with 30", () => {
    for (const value of ["", " ", "-1", "2.5", "1e2", "NaN", "3651", "123abc"]) {
      expect(parsePaymentTermsDays(value)).toBeNull();
    }
  });
});
