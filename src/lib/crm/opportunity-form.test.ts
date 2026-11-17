import { describe, expect, it } from "vitest";
import { validateOpportunityForm } from "@/lib/crm/opportunity-form";

describe("validateOpportunityForm", () => {
  it("converts valid input to minor units", () => {
    expect(validateOpportunityForm("New renewal", "340.25")).toEqual({
      valid: true,
      amountMinor: 34025,
      message: null,
    });
    expect(validateOpportunityForm("New renewal", ".50")).toMatchObject({
      valid: true,
      amountMinor: 50,
    });
    expect(validateOpportunityForm("New renewal", "")).toMatchObject({
      valid: true,
      amountMinor: 0,
    });
  });

  it.each(["-1", "1.245", "3e5", "NaN", "99999999999999999"])(
    "rejects invalid amount %s",
    (input) => expect(validateOpportunityForm("New renewal", input).valid).toBe(false),
  );

  it("requires a nonblank opportunity name", () => {
    expect(validateOpportunityForm("   ", "22").valid).toBe(false);
  });
});
