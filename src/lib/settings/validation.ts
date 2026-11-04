/** Normalize a database settings version without masking malformed client values. */
export function parseExpectedSettingsVersion(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("Invalid settings version");
  }
  return value;
}

/** Do not coerce client-supplied flags such as the string "false" to true. */
export function assertSettingsBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new Error("Invalid settings boolean");
  }
  return value;
}
