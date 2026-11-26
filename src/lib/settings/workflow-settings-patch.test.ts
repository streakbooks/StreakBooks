import { describe, expect, it } from "vitest";
import { toWorkflowSettingsPatch } from "./workflow-settings-patch";

describe("workflow settings partial updates", () => {
  it("touches only the submitted module-owned fields", () => {
    expect(
      toWorkflowSettingsPatch({
        accountingRequireJournalMemo: true,
        bankingCsvDateFormat: "DD/MM/YYYY",
      }),
    ).toEqual({
      accounting_require_journal_memo: true,
      banking_csv_date_format: "DD/MM/YYYY",
    });
  });

  it("preserves explicit false, empty text, and zero values", () => {
    expect(
      toWorkflowSettingsPatch({
        salesDefaultPaymentTermsDays: 0,
        salesDefaultNotes: "",
        salesPricesIncludeTax: false,
        purchasesRequirePo: false,
      }),
    ).toEqual({
      sales_default_payment_terms_days: 0,
      sales_default_notes: "",
      sales_prices_include_tax: false,
      purchases_require_po: false,
    });
  });

  it("returns an empty patch when no settings were submitted", () => {
    expect(toWorkflowSettingsPatch({})).toEqual({});
  });
});
