import { describe, expect, it } from "vitest";
import {
  billingAccountSchema,
  billingProfileSchema,
  updateBillingProfileInput,
} from "./billing-accounts";

const account = {
  id: "8c3c4a3e-2f7b-4d6e-9b1a-0c2f3e4d5a6b",
  accountType: "ORGANIZATION",
  displayName: "Alpha Ltd",
  status: "ACTIVE",
  billingEmail: null,
  legalName: null,
  address: { line1: null, line2: null, city: null, region: null, postalCode: null },
  billingCountry: "GB",
  countrySource: "USER_SELECTED",
  userLimit: null,
  companyLimit: 1,
  isOwner: true,
  updatedAt: "2026-11-05T10:00:00.000000+00:00",
  companies: [{ id: "1c3c4a3e-2f7b-4d6e-9b1a-0c2f3e4d5a6b", name: "Alpha Ltd" }],
  permissions: { view: true, manage: true, paymentMethods: true },
};

describe("billing account contract", () => {
  it("accepts the database function's response shape", () => {
    expect(billingAccountSchema.parse(account).accountType).toBe("ORGANIZATION");
  });

  it("rejects an unexpected account type or country source", () => {
    expect(() => billingAccountSchema.parse({ ...account, accountType: "FIRM" })).toThrow();
    expect(() => billingAccountSchema.parse({ ...account, countrySource: "CLIENT" })).toThrow();
  });
});

describe("billing profile input", () => {
  it("normalises the country code and trims text", () => {
    expect(billingProfileSchema.parse({ billingCountry: "in", city: "  Pune " })).toEqual({
      billingCountry: "IN",
      city: "Pune",
    });
  });

  it("rejects unknown fields such as card data", () => {
    expect(() => billingProfileSchema.parse({ cardNumber: "4242424242424242" })).toThrow();
  });

  it("rejects an empty update, bad email and bad country", () => {
    expect(() => billingProfileSchema.parse({})).toThrow();
    expect(() => billingProfileSchema.parse({ billingEmail: "not-an-email" })).toThrow();
    expect(() => billingProfileSchema.parse({ billingCountry: "IND" })).toThrow();
  });

  it("requires a uuid account id and the concurrency token", () => {
    expect(() =>
      updateBillingProfileInput.parse({
        accountId: "x",
        expectedUpdatedAt: "t",
        profile: { city: "A" },
      }),
    ).toThrow();
    expect(() =>
      updateBillingProfileInput.parse({
        accountId: account.id,
        expectedUpdatedAt: "",
        profile: { city: "A" },
      }),
    ).toThrow();
  });
});
