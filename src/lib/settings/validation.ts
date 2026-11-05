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

/** Lock dates must be real calendar days; never silently coerce malformed input. */
export function parseOptionalLockDate(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Invalid lock policy date");
  }
  if (value.startsWith("0000-")) throw new Error("Invalid lock policy date");
  const date = new Date(value + "T00:00:00.000Z");
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("Invalid lock policy date");
  }
  return value;
}

/** The historical default is true only when the option is genuinely omitted. */
export function parseOptionalOverrideReason(value: unknown): boolean {
  return value === undefined ? true : assertSettingsBoolean(value);
}
