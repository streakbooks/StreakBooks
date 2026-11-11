import { SETTINGS_CATEGORIES, type SettingsCategory } from "./categories";
import type { SettingsDestination } from "./module-navigation";
const specific = [
  "branding",
  "numbering",
  "supplier-defaults",
  "customer-defaults",
  "contact-settings",
  "sales-defaults",
  "purchases-defaults",
  "reminders",
  "portals",
  "bank-rules",
  "bank-feeds",
  "bank-import",
] as const;
export type SettingsPanelId = (typeof specific)[number] | `category:${SettingsCategory}`;
const ids = new Set<string>([...specific, ...SETTINGS_CATEGORIES.map((c) => `category:${c}`)]);
export function parseSettingsPanel(value: unknown): SettingsPanelId | undefined {
  return typeof value === "string" && ids.has(value) ? (value as SettingsPanelId) : undefined;
}
export function validateSettingsPanelSearch(search: Record<string, unknown>): {
  settingsPanel?: SettingsPanelId;
  settingsTrail?: SettingsPanelId[];
} {
  const panel = parseSettingsPanel(search["settingsPanel"]);
  const trail = settingsPanelTrail(search["settingsTrail"]);
  return panel ? { settingsPanel: panel, ...(trail.length ? { settingsTrail: trail } : {}) } : {};
}
export function panelForDestination(destination: SettingsDestination): SettingsPanelId | undefined {
  if (destination.panel) return destination.panel;
  if (destination.to === "/documents/branding") return "branding";
  if (destination.to === "/contacts/settings") return "contact-settings";
  if (destination.to === "/sales/settings") return "sales-defaults";
  if (destination.to === "/purchases/settings") return "purchases-defaults";
  if (destination.to === "/sales/reminders") return "reminders";
  if (destination.to === "/banking/rules") return "bank-rules";
  if (destination.to === "/banking/feeds") return "bank-feeds";
  if (destination.to === "/banking/import") return "bank-import";
  if (destination.to === "/settings" && destination.section)
    return destination.section === "documents"
      ? "numbering"
      : destination.section === "portals"
        ? "portals"
        : `category:${destination.section}`;
  return undefined;
}
export function panelLabel(panel: SettingsPanelId, owner?: string): string {
  if (panel.startsWith("category:")) {
    const key = panel.slice(9).replaceAll("_", " ");
    return `${key.charAt(0).toUpperCase() + key.slice(1)} settings`;
  }
  return {
    branding: owner === "purchases" ? "Purchase document themes" : "Invoice themes & branding",
    numbering: "Document numbering",
    "supplier-defaults": "Supplier defaults",
    "customer-defaults": "Customer defaults",
    "contact-settings": "Contact defaults and numbering",
    "sales-defaults": "Sales defaults",
    "purchases-defaults": "Purchases defaults",
    reminders: "Invoice reminders",
    portals: owner === "purchases" ? "Supplier portal settings" : "Portal settings",
    "bank-rules": "Bank rules",
    "bank-feeds": "Bank connections",
    "bank-import": "Bank statement imports",
  }[panel as (typeof specific)[number]];
}
export function closeSettingsPanel(search: Record<string, unknown>): Record<string, unknown> {
  const next = { ...search };
  // An invalid or absent current panel must not resurrect an old panel from a stale trail.
  if (!parseSettingsPanel(search["settingsPanel"])) {
    delete next["settingsPanel"];
    delete next["settingsTrail"];
    return next;
  }
  const trail = [...settingsPanelTrail(search["settingsTrail"])];
  const previous = trail.pop();
  if (previous) next["settingsPanel"] = previous;
  else delete next["settingsPanel"];
  if (trail.length) next["settingsTrail"] = trail;
  else delete next["settingsTrail"];
  return next;
}
export function settingsPanelTrail(value: unknown): SettingsPanelId[] {
  return Array.isArray(value) &&
    value.length <= 8 &&
    value.every((id) => parseSettingsPanel(id) !== undefined)
    ? (value as SettingsPanelId[])
    : [];
}
export function openSettingsPanel(
  search: Record<string, unknown>,
  panel: SettingsPanelId,
): Record<string, unknown> {
  const previous = parseSettingsPanel(search["settingsPanel"]);
  let trail = settingsPanelTrail(search["settingsTrail"]);
  if (previous && previous !== panel) {
    const existing = trail.indexOf(panel);
    trail = existing >= 0 ? trail.slice(0, existing) : [...trail, previous].slice(-8);
  }
  const next = { ...search, settingsPanel: panel };
  if (trail.length) return { ...next, settingsTrail: trail };
  delete (next as Record<string, unknown>)["settingsTrail"];
  return next;
}
