import { describe, expect, it } from "vitest";
import { validateCrmLeadForm } from "@/lib/crm/lead-form";

const draft = {
  firstName: "Avery",
  lastName: "Morgan",
  organizationName: "",
  email: "avery@example.com",
  estimatedMajor: "125.05",
};

describe("validateCrmLeadForm", () => {
  it("converts a decimal amount exactly to current CRM minor units", () => {
    expect(validateCrmLeadForm(draft)).toEqual({
      valid: true,
      estimatedValueMinor: 12505,
      message: null,
    });
  });

  it("allows organization-only or email-only leads", () => {
    expect(validateCrmLeadForm({ ...draft, firstName: "", lastName: "", email: "", organizationName: "Acme" }).valid).toBe(true);
    expect(validateCrmLeadForm({ ...draft, firstName: "", lastName: "", organizationName: "Acme", email: "" }).valid).toBe(true);
  });

  it("rejects missing identity and malformed emails", () => {
    expect(validateCrmLeadForm({ ...draft, firstName: "", lastName: "", organizationName: "", email: "" }).valid).toBe(false);
    expect(validateCrmLeadForm({ ...draft, email: "invalid@" }).valid).toBe(false);
  });

  it.each(["-5", "1.234", "1e5", "not a number", "99999999999999999"])(
    "rejects malformed or unsafe amount %s",
    (estimatedMajor) => {
      expect(validateCrmLeadForm({ ...draft, estimatedMajor }).valid).toBe(false);
    },
  );

  it("accepts a blank or zero amount", () => {
    expect(validateCrmLeadForm({ ...draft, estimatedMajor: "" })).toMatchObject({ valid: true, estimatedValueMinor: 0 });
    expect(validateCrmLeadForm({ ...draft, estimatedMajor: "0" })).toMatchObject({ valid: true, estimatedValueMinor: 0 });
  });
});
