import type { SettingsDocument } from "./settings-centre.functions";
import { CATEGORY_SCHEMAS, defaultDocumentFor, type SettingsCategory } from "./registry";

export function areSettingsDocumentsEqual(a: SettingsDocument, b: SettingsDocument): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;

  return keys.every((key) => {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    const left = a[key];
    const right = b[key];
    if (Array.isArray(left) || Array.isArray(right)) {
      return (
        Array.isArray(left) &&
        Array.isArray(right) &&
        left.length === right.length &&
        left.every((value, index) => Object.is(value, right[index]))
      );
    }
    return Object.is(left, right);
  });
}

/** A nullable number still needs a text editor; its empty value means no threshold. */
export function isNullableNumericSetting(category: SettingsCategory, key: string): boolean {
  return category === "purchases" && key === "approval_threshold_minor";
}

type ValidSettingsDraft = {
  ok: true;
  document: SettingsDocument;
  errors: Record<string, string>;
};

type InvalidSettingsDraft = {
  ok: false;
  errors: Record<string, string>;
};

/**
 * Keep the user's numeric input as text while editing (including empty or
 * partially typed values). Convert only valid numbers when saving, then run
 * the same category schema used by the server.
 */
export function validateSettingsDraft(
  category: SettingsCategory,
  draft: SettingsDocument,
): ValidSettingsDraft | InvalidSettingsDraft {
  const schema = CATEGORY_SCHEMAS[category];
  if (!schema) {
    return { ok: false, errors: { _form: "This category has no editable settings." } };
  }

  const normalized: SettingsDocument = { ...draft };
  const defaults = defaultDocumentFor(category);

  for (const [key, defaultValue] of Object.entries(defaults)) {
    const value = normalized[key];
    if (
      (typeof defaultValue === "number" || isNullableNumericSetting(category, key)) &&
      typeof value === "string"
    ) {
      const text = value.trim();
      if (!text && isNullableNumericSetting(category, key)) {
        normalized[key] = null;
      } else if (!text || !Number.isFinite(Number(text))) {
        return { ok: false, errors: { [key]: "Enter a valid number." } };
      } else {
        normalized[key] = Number(text);
      }
    }
  }

  const parsed = schema.safeParse(normalized);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "_form");
      errors[key] ??= issue.message;
    }
    return { ok: false, errors };
  }

  return { ok: true, document: parsed.data as SettingsDocument, errors: {} };
}
