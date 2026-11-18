export const role = new URLSearchParams(location.search).get("role") ?? "maker";
export const useCan = () => ({
  can: (permission: string) =>
    role !== "viewer" && (permission !== "purchases.authorise" || role === "reviewer"),
});
export const useActiveCompany = () => ({
  company: { id: "company", base_currency: "GBP", locale: "en-GB", date_format: null },
});
export const friendlyAuthError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
