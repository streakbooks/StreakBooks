export const SETTINGS_OVERVIEW_COMPANY_SELECT =
  "name, base_currency, fiscal_year_end_month, is_demo, company_tax_settings(tax_regime)";

type SettingsOverviewCompanyRow = {
  name: string;
  base_currency: string;
  fiscal_year_end_month: number;
  is_demo: boolean;
  company_tax_settings?:
    { tax_regime?: string | null } | Array<{ tax_regime?: string | null }> | null;
};

export function mapSettingsOverviewCompany(raw: unknown) {
  const company = raw as SettingsOverviewCompanyRow;
  const taxSettings = Array.isArray(company.company_tax_settings)
    ? company.company_tax_settings[0]
    : company.company_tax_settings;
  return {
    name: company.name,
    base_currency: company.base_currency,
    fiscal_year_end_month: company.fiscal_year_end_month,
    tax_regime: taxSettings?.tax_regime ?? null,
    is_demo: company.is_demo,
  };
}
