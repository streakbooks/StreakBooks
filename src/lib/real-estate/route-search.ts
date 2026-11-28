const SECTION_KEYS = new Set([
  "overview",
  "projects",
  "inventory",
  "reservations",
  "sales",
  "payment-plans",
  "instalments",
  "collections",
  "commissions",
  "development-costs",
  "budgets",
  "reports",
  "settings",
]);

export function isRealEstateRouteSection(value: string): boolean {
  return SECTION_KEYS.has(value);
}

export function realEstateRouteSearch(search: { [key: string]: unknown }): {
  project: string;
  unit: string;
  sale: string;
} {
  const project = search["project"];
  const unit = search["unit"];
  const sale = search["sale"];
  return {
    project: typeof project === "string" ? project : "",
    unit: typeof unit === "string" ? unit : "",
    sale: typeof sale === "string" ? sale : "",
  };
}
