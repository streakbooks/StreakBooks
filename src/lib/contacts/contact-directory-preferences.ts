import {
  normalizeContactDirectoryColumns,
  type ContactDirectoryColumnId,
} from "@/lib/contacts/contact-directory-columns";
import {
  normalizeContactSavedViews,
  type ContactSavedView,
} from "@/lib/contacts/contact-advanced-filters";

/**
 * Stored in the existing user_ui_preferences table. Keys are per user + company.
 * Separate keys prevent a column change from overwriting saved views on another tab.
 */
export const CONTACT_PREFERENCE_KEYS = {
  columns: "contacts.directory.columns.v1",
  views: "contacts.directory.views.v1",
} as const;

export type ContactPreferenceKind = keyof typeof CONTACT_PREFERENCE_KEYS;

export type ContactPreferenceValue = ContactDirectoryColumnId[] | ContactSavedView[];

export function normalizeContactPreference(
  kind: ContactPreferenceKind,
  value: unknown,
): ContactPreferenceValue {
  if (kind === "columns") return normalizeContactDirectoryColumns(value);
  return normalizeContactSavedViews(value);
}

export type ContactDirectoryCloudPreferences = {
  columns: ContactDirectoryColumnId[] | null;
  views: ContactSavedView[] | null;
};

export function readCloudContactPreferences(
  rows: Array<{ preference_key: string; preference_value: unknown }>,
): ContactDirectoryCloudPreferences {
  const columns = rows.find((row) => row.preference_key === CONTACT_PREFERENCE_KEYS.columns);
  const views = rows.find((row) => row.preference_key === CONTACT_PREFERENCE_KEYS.views);
  return {
    columns: columns ? normalizeContactDirectoryColumns(columns.preference_value) : null,
    views: views ? normalizeContactSavedViews(views.preference_value) : null,
  };
}
