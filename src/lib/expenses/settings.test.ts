import { describe, expect, it } from "vitest";
import { mapExpenseManagementSettings, toExpenseManagementSettingsPayload } from "./settings";

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
        requireReceiptAboveMinor: 0,
        allowMultiCurrencyClaims: true,
        preventSelfApproval: true,
        defaultDistanceUnit: "km",
      }),
    ).toMatchObject({
      version: 2,
      claim_number_prefix: "EXP-",
      default_claim_currency: "USD",
      default_distance_unit: "km",
    });
  });
});
