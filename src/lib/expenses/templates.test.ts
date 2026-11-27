import { describe, expect, it } from "vitest";
import { isExpenseClaimTemplateCompatible } from "./templates";

describe("isExpenseClaimTemplateCompatible", () => {
  it("matches template amounts to the active claim currency", () => {
    expect(isExpenseClaimTemplateCompatible({ claimCurrency: "USD" }, "USD", "INR")).toBe(true);
    expect(isExpenseClaimTemplateCompatible({ claimCurrency: "USD" }, "INR", "INR")).toBe(false);
    expect(isExpenseClaimTemplateCompatible({ claimCurrency: null }, "INR", "INR")).toBe(true);
  });
});
