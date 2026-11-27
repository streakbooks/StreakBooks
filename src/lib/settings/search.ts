import { resolveSettingsCategory } from "./registry";
import { validateSettingsPanelSearch, type SettingsPanelId } from "./panels";
import { validateSettingsReturnTo } from "./return-context";
import { SETTING_CAPABILITY_REGISTRY, SETTING_FIELD_COVERAGE } from "./capability-registry";
import type { SettingsCategory } from "./categories";
import { SETTINGS_CATEGORIES } from "./categories";
import { settingsRouteForSection, settingsRoutePath } from "./route-model";

export type SettingsFieldSearchResult = {
  key: string;
  label: string;
  consumer: string;
  to: string;
  section: SettingsCategory | null;
  status: "complete" | "partial";
};

function matchesSettingQuery(query: string, values: readonly string[]): boolean {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const searchable = values.map((value) => value.toLocaleLowerCase());
  return (
    terms.length > 0 && terms.every((term) => searchable.some((value) => value.includes(term)))
  );
}

/** Search typed fields and standalone verified capabilities from one index. */
export function searchSettingsFields(query: string): SettingsFieldSearchResult[] {
  if (!query.trim()) return [];

  const typedKeys = new Set(SETTING_FIELD_COVERAGE.map((field) => field.key));
  const typedMatches = SETTING_FIELD_COVERAGE.filter((field) =>
    matchesSettingQuery(query, [field.label, field.key, field.consumer]),
  ).map((field) => ({
    key: field.key,
    label: field.label,
    consumer: field.consumer,
    to: settingsRoutePath(settingsRouteForSection(field.category)),
    section: field.category,
    status: field.status,
  }));

  const capabilityMatches = SETTING_CAPABILITY_REGISTRY.filter(
    (setting) =>
      !typedKeys.has(setting.key) &&
      matchesSettingQuery(query, [setting.label, setting.key, setting.consumer]),
  ).map((setting) => {
    if (setting.route === "/tax") {
      return {
        key: setting.key,
        label: setting.label,
        consumer: setting.consumer,
        to: "/tax",
        section: null,
        status: "complete" as const,
      };
    }
    if (setting.route === "/settings") {
      return {
        key: setting.key,
        label: setting.label,
        consumer: setting.consumer,
        to: settingsRoutePath(settingsRouteForSection("documents")),
        section: "documents" as const,
        status: "complete" as const,
      };
    }
    const section = setting.route.split("/")[2] as SettingsCategory | undefined;
    return {
      key: setting.key,
      label: setting.label,
      consumer: setting.consumer,
      to: setting.route,
      section: section ?? null,
      status: "complete" as const,
    };
  });

  return [...typedMatches, ...capabilityMatches].slice(0, 8);
}

/** Normalize untrusted deep-link parameters without changing valid billing links. */
export function parseSettingsSearch(search: Record<string, unknown>): {
  section: string;
  invalidSection?: boolean;
  plan?: string;
  interval?: "month" | "year";
  returnTo?: string;
  settingsPanel?: SettingsPanelId;
  settingsTrail?: SettingsPanelId[];
} {
  const candidate = search["plan"];
  const plan =
    typeof candidate === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(candidate)
      ? candidate
      : undefined;
  const interval =
    search["interval"] === "month" || search["interval"] === "year"
      ? search["interval"]
      : undefined;
  const sectionCandidate = search["section"];
  const invalidSection =
    sectionCandidate !== undefined &&
    (typeof sectionCandidate !== "string" ||
      !SETTINGS_CATEGORIES.includes(sectionCandidate as SettingsCategory));
  const returnTo = validateSettingsReturnTo(search["returnTo"]);
  return {
    section: resolveSettingsCategory(search["section"]),
    ...(invalidSection ? { invalidSection: true } : {}),
    ...(plan ? { plan } : {}),
    ...(interval ? { interval } : {}),
    ...(returnTo ? { returnTo } : {}),
    ...validateSettingsPanelSearch(search),
  };
}
