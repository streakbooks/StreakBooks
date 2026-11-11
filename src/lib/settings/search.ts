import { resolveSettingsCategory } from "./registry";

/** Normalize untrusted deep-link parameters without changing valid billing links. */
export function parseSettingsSearch(search: Record<string, unknown>): {
  section: string;
  plan?: string;
  interval?: "month" | "year";
} {
  const candidate = search["plan"];
  const plan =
    typeof candidate === "string" &&
    /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(candidate)
      ? candidate
      : undefined;
  const interval =
    search["interval"] === "month" || search["interval"] === "year"
      ? search["interval"]
      : undefined;
  return {
    section: resolveSettingsCategory(search["section"]),
    ...(plan ? { plan } : {}),
    ...(interval ? { interval } : {}),
  };
}
