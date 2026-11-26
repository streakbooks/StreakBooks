import { describe, expect, it } from "vitest";
import {
  mapSettingsOverviewCompany,
  SETTINGS_OVERVIEW_COMPANY_SELECT,
} from "./settings-overview-company";

describe("Settings overview company schema mapping", () => {
  it("loads tax regime from its authoritative one-to-one tax settings relation", () => {
    expect(SETTINGS_OVERVIEW_COMPANY_SELECT).toContain("company_tax_settings(tax_regime)");
    expect(SETTINGS_OVERVIEW_COMPANY_SELECT).not.toMatch(/(?:^|,\s*)tax_regime(?:,|$)/);
    expect(
      mapSettingsOverviewCompany({
        name: "Demo Company",
        base_currency: "INR",
        fiscal_year_end_month: 3,
        is_demo: true,
        company_tax_settings: { tax_regime: "gst" },
      }),
    ).toEqual({
      name: "Demo Company",
      base_currency: "INR",
      fiscal_year_end_month: 3,
      tax_regime: "gst",
      is_demo: true,
    });
  });

  it("handles an unset tax row and array-shaped relation without inventing a regime", () => {
    expect(
      mapSettingsOverviewCompany({
        name: "Unregistered Company",
        base_currency: "USD",
        fiscal_year_end_month: 12,
        is_demo: false,
        company_tax_settings: [],
      }).tax_regime,
    ).toBeNull();
    expect(
      mapSettingsOverviewCompany({
        name: "GST Company",
        base_currency: "INR",
        fiscal_year_end_month: 3,
        is_demo: false,
        company_tax_settings: [{ tax_regime: "gst" }],
      }).tax_regime,
    ).toBe("gst");
  });
});
