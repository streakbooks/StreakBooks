/** Pure helpers for optimistic concurrency on organisation Contact defaults. */
export const CONTACT_SETTINGS_CONFLICT_MESSAGE =
  "Contact settings changed since you opened them. Reload latest values before saving.";

export function parseContactSettingsRevision(value: unknown): string | null {
  if (value === null) return null;
  if (
    typeof value !== "string" ||
    value.length > 45 ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new Error("A valid contact settings revision is required. Reload settings and retry.");
  }
  return value;
}

/**
 * Maintain a strictly increasing timestamp even when two writes share one
 * millisecond or clocks move backwards. The conditional UPDATE remains atomic.
 */
export function nextContactSettingsRevision(
  expected: string | null,
  now: number = Date.now(),
): string {
  const previous = expected === null ? 0 : Date.parse(expected);
  return new Date(Math.max(now, previous + 1)).toISOString();
}
