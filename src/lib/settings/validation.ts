/** Normalize a database settings version without masking malformed client values. */
export function parseExpectedSettingsVersion(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("Invalid settings version");
  }
  return value;
}
