import { describe, expect, it } from "vitest";
import {
  expenseClaimCurrencyOptions,
  mapExpenseManagementSettings,
  resolveExpenseClaimCurrency,
  toExpenseManagementSettingsPayload,
  validateExpenseClaimCurrency,
} from "./settings";

describe("expense claim currency settings", () => {
  it("offers only valid unique enabled currencies with the base currency first", () => {
    expect(expenseClaimCurrencyOptions("inr", ["USD", "usd", "US", "EUR"])).toEqual([
      "INR",
      "EUR",
      "USD",
    ]);
  });

  it("uses an enabled default only when multi-currency claims are allowed", () => {
    const currencies = ["INR", "USD"];
    expect(
      resolveExpenseClaimCurrency({
        baseCurrency: "INR",
        defaultCurrency: "usd",
        allowMultiCurrencyClaims: true,
        enabledCurrencies: currencies,
      }),
    ).toBe("USD");
    expect(
      resolveExpenseClaimCurrency({
        baseCurrency: "INR",
        defaultCurrency: "EUR",
        allowMultiCurrencyClaims: true,
        enabledCurrencies: currencies,
      }),
    ).toBe("INR");
    expect(
      resolveExpenseClaimCurrency({
        baseCurrency: "INR",
        defaultCurrency: "USD",
        allowMultiCurrencyClaims: false,
        enabledCurrencies: currencies,
      }),
    ).toBe("INR");
  });

  it("rejects disabled or unsupported company currencies when saving a default", () => {
    expect(
      validateExpenseClaimCurrency({
        baseCurrency: "INR",
        defaultCurrency: "INR",
        allowMultiCurrencyClaims: false,
        enabledCurrencies: [],
      }),
    ).toBe("INR");
    expect(() =>
      validateExpenseClaimCurrency({
        baseCurrency: "INR",
        defaultCurrency: "USD",
        allowMultiCurrencyClaims: false,
        enabledCurrencies: ["USD"],
      }),
    ).toThrow(/Enable multi-currency/);
    expect(() =>
      validateExpenseClaimCurrency({
        baseCurrency: "INR",
        defaultCurrency: "USD",
        allowMultiCurrencyClaims: true,
        enabledCurrencies: [],
      }),
    ).toThrow(/enabled company currency/);
  });
});

describe("expense management settings mapping", () => {
  it("returns a safe default when settings do not exist yet", () => {
    expect(mapExpenseManagementSettings(null, "company-1")).toMatchObject({
      companyId: "company-1",
      enabled: false,
      claimNumberPrefix: "EXP-",
      requireSpendingRequestAboveMinor: 0,
      version: 0,
      exists: false,
      preventSelfApproval: true,
    });
  });

  it("maps snake_case RPC payloads", () => {
    const mapped = mapExpenseManagementSettings(
      {
        company_id: "company-1",
        enabled: true,
        claim_number_prefix: "CLM-",
        default_claim_currency: "AUD",
        rebilling_income_account_id: "inc-1",
        require_receipt_above_minor: 2500,
        allow_multi_currency_claims: false,
        prevent_self_approval: true,
        default_distance_unit: "mi",
        version: 3,
        exists: true,
      },
      "company-1",
    );
    expect(mapped).toMatchObject({
      enabled: true,
      claimNumberPrefix: "CLM-",
      defaultClaimCurrency: "AUD",
      rebillingIncomeAccountId: "inc-1",
      requireReceiptAboveMinor: 2500,
      allowMultiCurrencyClaims: false,
      defaultDistanceUnit: "mi",
      version: 3,
      exists: true,
    });
  });

  it("serialises camelCase drafts for the save RPC", () => {
    expect(
      toExpenseManagementSettingsPayload({
        version: 2,
        enabled: true,
        claimNumberPrefix: "EXP-",
        defaultClaimCurrency: "USD",
        rebillingIncomeAccountId: "inc-9",
        requireReceiptAboveMinor: 0,
        allowMultiCurrencyClaims: true,
        preventSelfApproval: true,
        defaultDistanceUnit: "km",
      }),
    ).toMatchObject({
      version: 2,
      claim_number_prefix: "EXP-",
      default_claim_currency: "USD",
      rebilling_income_account_id: "inc-9",
      default_distance_unit: "km",
    });
  });
});
