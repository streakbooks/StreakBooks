/**
 * Shared helpers for sticky `?create=true` deep links.
 * Prefer omitting `create` over `{ create: undefined }` under exactOptionalPropertyTypes.
 */

export function parseCreateSearchFlag(raw: Record<string, unknown>): boolean {
  return (
    raw["create"] === true ||
    raw["create"] === "true" ||
    raw["create"] === "1" ||
    raw["create"] === 1
  );
}

export function omitCreateFromSearch<T extends Record<string, unknown>>(
  prev: T,
): Omit<T, "create"> {
  const next = { ...prev };
  delete (next as { create?: unknown }).create;
  return next;
}
